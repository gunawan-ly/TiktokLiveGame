from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Set

from websockets.asyncio.server import ServerConnection, serve

from .combo import GiftAction
from .session_log import SessionLog


class Bridge:
    """Local WebSocket bridge between the connector and the overlay."""

    def __init__(
        self,
        host: str,
        port: int,
        target_coins: int,
        logger: logging.Logger,
        session_log: SessionLog | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self.target_coins = target_coins
        self.logger = logger
        self.session_log = session_log
        self._clients: Set[ServerConnection] = set()
        self._server = None
        self._status = "starting"
        self._detail = ""
        self._stats = {
            "printed": 0,
            "giftsEmitted": 0,
            "totalCoins": 0,
            "lastGift": None,
        }

    async def start(self) -> None:
        self._server = await serve(
            self._handle_client,
            self.host,
            self.port,
            max_size=64 * 1024,
            ping_interval=20,
            ping_timeout=20,
        )
        self.logger.info("WebSocket bridge aktif di ws://%s:%s", self.host, self.port)

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None
        self._clients.clear()

    def _snapshot(self) -> dict[str, Any]:
        return {
            "type": "snapshot",
            "connection": self._status,
            "detail": self._detail,
            "targetCoins": self.target_coins,
            "stats": dict(self._stats),
            "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
        }

    async def _handle_client(self, websocket: ServerConnection) -> None:
        self._clients.add(websocket)
        self.logger.info("Overlay tersambung (%s klien)", len(self._clients))
        try:
            await websocket.send(json.dumps(self._snapshot(), ensure_ascii=False))
            async for _message in websocket:
                # Saat ini bridge hanya satu arah. Pesan dari overlay diabaikan
                # agar klien lama tidak memutus koneksi.
                continue
        except Exception as exc:
            self.logger.debug("Klien overlay terputus: %s", exc)
        finally:
            self._clients.discard(websocket)
            self.logger.info("Overlay terputus (%s klien)", len(self._clients))

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        if not self._clients:
            return
        message = json.dumps(payload, ensure_ascii=False)
        dead: list[ServerConnection] = []
        for client in list(self._clients):
            try:
                await client.send(message)
            except Exception:
                dead.append(client)
        for client in dead:
            self._clients.discard(client)

    async def set_status(self, connection: str, detail: str = "") -> None:
        if self._status == connection and self._detail == detail:
            return
        self._status = connection
        self._detail = detail
        self.logger.info("Status connector: %s%s", connection, f" ({detail})" if detail else "")
        if self.session_log:
            self.session_log.write("status", {"connection": connection, "detail": detail})
        await self._broadcast(
            {
                "type": "status",
                "connection": connection,
                "detail": detail,
                "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
            }
        )

    async def publish_action(self, action: GiftAction) -> None:
        message = action.to_message()
        self._stats["printed"] += 1
        self._stats["giftsEmitted"] = self._stats["printed"]
        self._stats["totalCoins"] += action.total_coins
        self._stats["lastGift"] = {
            "displayName": action.signal.display_name,
            "giftName": action.signal.gift_name,
            "repeat": action.repeat,
            "totalCoins": action.total_coins,
        }
        if self.session_log:
            self.session_log.write(
                "gift",
                {
                    "eventId": action.event_id,
                    "username": action.signal.username,
                    "displayName": action.signal.display_name,
                    "giftId": action.signal.gift_id,
                    "giftName": action.signal.gift_name,
                    "repeat": action.repeat,
                    "coinsPerItem": action.signal.coins_per_item,
                    "totalCoins": action.total_coins,
                },
            )
        self.logger.info(
            "Gift -> %s | %s x%d | %d koin",
            action.signal.display_name,
            action.signal.gift_name,
            action.repeat,
            action.total_coins,
        )
        await self._broadcast(message)

    async def publish_emerald(self, award, run_id: str) -> None:
        """Broadcast a Zamrud print a viewer earned via tap-tap.

        Counts as a print in the session stats but never as coins: it is
        an engagement reward, not a gift. The event id is deterministic
        per connector run + user + like multiple, so the overlay dedupes
        replays of the same award while every new multiple (and every
        connector restart, via the new run id) prints as its own event.
        """

        event_id = f"emerald-{run_id}-{award.user_id}-{award.multiple}"
        timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
        message = {
            "type": "emerald_print",
            "eventId": event_id,
            "user": {
                "username": award.username,
                "displayName": award.display_name,
                "avatarUrl": award.avatar_url,
            },
            "likeTotal": award.like_total,
            "threshold": award.threshold,
            "timestamp": timestamp,
        }
        self._stats["printed"] += 1
        if self.session_log:
            self.session_log.write(
                "emerald",
                {
                    "eventId": event_id,
                    "username": award.username,
                    "displayName": award.display_name,
                    "likeTotal": award.like_total,
                    "threshold": award.threshold,
                },
            )
        self.logger.info(
            "Zamrud -> %s | %d like (ambang %d)",
            award.display_name,
            award.like_total,
            award.threshold,
        )
        await self._broadcast(message)

    @property
    def stats(self) -> dict[str, Any]:
        return dict(self._stats)
