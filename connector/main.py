from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys
from contextlib import suppress

from dotenv import load_dotenv
from TikTokLive import TikTokLiveClient
from TikTokLive.client.errors import UserOfflineError
from TikTokLive.client.web.web_settings import WebDefaults
from TikTokLive.events import ConnectEvent, DisconnectEvent, GiftEvent

from .bridge import Bridge
from .combo import ComboAggregator
from .config import PROJECT_ROOT, ConnectorConfig
from .mock_feed import MockFeed
from .normalizer import extract_gift_signal
from .session_log import SessionLog


LOGGER = logging.getLogger("studio")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Studio Photo TikTok LIVE connector"
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Jalankan mock feed tanpa koneksi TikTok / API key.",
    )
    parser.add_argument(
        "--username",
        help="Override username TikTok dari .env.",
    )
    parser.add_argument(
        "--mock-interval",
        type=float,
        default=4.0,
        help="Jeda antar gift mock dalam detik (default: 4).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Tampilkan log debug connector.",
    )
    return parser


def configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )
    logging.getLogger("TikTokLive").setLevel(
        logging.DEBUG if verbose else logging.WARNING
    )
    logging.getLogger("websockets").setLevel(logging.WARNING)


async def flush_loop(
    aggregator: ComboAggregator,
    bridge: Bridge,
    stop: asyncio.Event,
) -> None:
    while not stop.is_set():
        for action in aggregator.flush_expired():
            LOGGER.info("Combo timeout, menerbitkan gift yang tertahan")
            await bridge.publish_action(action)
        try:
            await asyncio.wait_for(stop.wait(), timeout=1.0)
        except TimeoutError:
            continue


async def _backoff(
    stop: asyncio.Event, delay: float, reason: str
) -> None:
    LOGGER.info("Mencoba lagi dalam %.0f detik%s", delay, f" ({reason})" if reason else "")
    with suppress(TimeoutError):
        await asyncio.wait_for(stop.wait(), timeout=delay)


async def live_forever(
    config: ConnectorConfig,
    bridge: Bridge,
    aggregator: ComboAggregator,
    stop: asyncio.Event,
) -> None:
    if not config.username:
        raise RuntimeError(
            "TIKTOK_USERNAME belum diisi. Isi .env atau jalankan dengan --mock."
        )
    if config.sign_api_key:
        WebDefaults.tiktok_sign_api_key = config.sign_api_key
    else:
        LOGGER.warning(
            "SIGN_API_KEY kosong. Koneksi live mungkin dibatasi oleh Euler Stream."
        )

    failure_streak = 0
    while not stop.is_set():
        await bridge.set_status("connecting", f"@{config.username}")
        client = TikTokLiveClient(unique_id=config.username)
        state = {"connected": False}

        @client.on(ConnectEvent)
        async def on_connect(event: ConnectEvent) -> None:
            state["connected"] = True
            await bridge.set_status("connected", f"room {event.room_id}")

        @client.on(DisconnectEvent)
        async def on_disconnect(_event: DisconnectEvent) -> None:
            if not stop.is_set():
                await bridge.set_status("disconnected", "koneksi TikTok terputus")

        @client.on(GiftEvent)
        async def on_gift(event: GiftEvent) -> None:
            try:
                signal = extract_gift_signal(event)
                if signal is None:
                    return
                for action in aggregator.add(signal):
                    await bridge.publish_action(action)
            except Exception:
                LOGGER.exception("Gagal memproses event gift")

        connect_task = asyncio.create_task(
            client.connect(fetch_live_check=True),
            name="tiktok-connect",
        )
        stop_task = asyncio.create_task(stop.wait(), name="connector-stop")
        try:
            done, _pending = await asyncio.wait(
                {connect_task, stop_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if stop_task in done:
                await _disconnect_client(client, connect_task)
                break

            stop_task.cancel()
            with suppress(asyncio.CancelledError):
                await stop_task

            if connect_task.cancelled():
                continue

            error = connect_task.exception()
            delay = None
            if error is not None:
                if isinstance(error, UserOfflineError):
                    await bridge.set_status(
                        "waiting", "room belum live, menunggu..."
                    )
                    delay = max(15, config.reconnect_base_seconds)
                    failure_streak += 1
                else:
                    LOGGER.warning("Koneksi TikTok gagal: %s", error)
                    await bridge.set_status("disconnected", str(error)[:160])
            else:
                await bridge.set_status("waiting", "stream selesai / terputus")

            if state["connected"]:
                failure_streak = 0
                delay = config.reconnect_base_seconds
            if delay is None:
                delay = min(
                    config.reconnect_max_seconds,
                    config.reconnect_base_seconds * (2 ** min(failure_streak, 3)),
                )
                failure_streak += 1

            await _disconnect_client(client, connect_task)
        except asyncio.CancelledError:
            await _disconnect_client(client, connect_task)
            raise
        finally:
            stop_task.cancel()
            with suppress(asyncio.CancelledError):
                await stop_task

        await _backoff(stop, delay, "reconnect")

    await bridge.set_status("disconnected", "connector berhenti")


async def _disconnect_client(
    client: TikTokLiveClient,
    connect_task: asyncio.Task,
) -> None:
    with suppress(Exception):
        await client.disconnect()
    if not connect_task.done():
        connect_task.cancel()
    with suppress(asyncio.CancelledError, Exception):
        await connect_task


async def async_main(args: argparse.Namespace) -> int:
    load_dotenv(PROJECT_ROOT / ".env")
    try:
        config = ConnectorConfig.from_env(args.username)
    except ValueError as exc:
        LOGGER.error("%s", exc)
        return 2

    if not args.mock and not config.username:
        LOGGER.error(
            "TIKTOK_USERNAME belum diisi. Gunakan --mock untuk pengembangan."
        )
        return 2

    try:
        session_log = SessionLog(config.log_dir)
    except OSError as exc:
        LOGGER.warning("Log sesi tidak dapat dibuat: %s", exc)
        session_log = None

    bridge = Bridge(
        host=config.ws_host,
        port=config.ws_port,
        target_coins=config.target_coins,
        logger=LOGGER,
        session_log=session_log,
    )
    aggregator = ComboAggregator()
    stop = asyncio.Event()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)

    await bridge.start()
    if session_log:
        LOGGER.info("Log sesi: %s", session_log.path)
    LOGGER.info("Target koin: %d", config.target_coins)

    tasks = [asyncio.create_task(flush_loop(aggregator, bridge, stop), name="flush")]
    if args.mock:
        feed = MockFeed(
            bridge=bridge,
            aggregator=aggregator,
            overlay_origin=config.overlay_origin,
            logger=LOGGER,
            interval=args.mock_interval,
        )
        tasks.append(asyncio.create_task(feed.run(stop), name="mock-feed"))
    else:
        tasks.append(
            asyncio.create_task(
                live_forever(config, bridge, aggregator, stop),
                name="tiktok-live",
            )
        )

    stop_waiter = asyncio.create_task(stop.wait(), name="stop-waiter")
    try:
        done, _pending = await asyncio.wait(
            [stop_waiter, *tasks],
            return_when=asyncio.FIRST_COMPLETED,
        )
        if stop_waiter not in done:
            for task in done:
                if task.cancelled():
                    continue
                error = task.exception()
                if error is not None:
                    LOGGER.error("Task connector berhenti: %s", error)
            stop.set()
    finally:
        stop_waiter.cancel()
        for task in [stop_waiter, *tasks]:
            task.cancel()
        for task in [stop_waiter, *tasks]:
            with suppress(asyncio.CancelledError, Exception):
                await task
        await bridge.stop()
        if session_log:
            session_log.write("stats", bridge.stats)
            session_log.close()
        LOGGER.info("Connector dihentikan.")

    return 0


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(args.verbose)
    try:
        raise SystemExit(asyncio.run(async_main(args)))
    except KeyboardInterrupt:
        LOGGER.info("Dihentikan oleh pengguna.")
        raise SystemExit(130)


if __name__ == "__main__":
    main()
