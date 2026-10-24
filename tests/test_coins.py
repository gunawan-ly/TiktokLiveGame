import asyncio
import logging
import time

from connector.bridge import Bridge
from connector.coins import CoinLedger
from connector.combo import GiftAction
from connector.normalizer import GiftSignal


def test_ledger_accumulates_per_user():
    ledger = CoinLedger()

    assert ledger.add("u1", 1) == 1
    assert ledger.add("u1", 9) == 10
    assert ledger.add("u2", 50) == 50
    assert ledger.total_for("u1") == 10
    assert ledger.total_for("u2") == 50
    assert ledger.total_for("tidak-ada") == 0


def test_ledger_ignores_negative_and_resets():
    ledger = CoinLedger()

    assert ledger.add("u1", -5) == 0
    assert ledger.add("", 100) == 0
    ledger.add("u1", 200)
    ledger.reset()
    assert ledger.total_for("u1") == 0


def _signal(user_id="u1", coins=1, repeat=1):
    return GiftSignal(
        user_id=user_id,
        username="awan",
        display_name="Awan",
        avatar_url="https://example.com/a.webp",
        gift_id=5655,
        gift_name="Mawar",
        repeat_count=repeat,
        coins_per_item=coins,
        group_id=0,
        order_id="",
        repeat_end=True,
        streakable=True,
        received_at=time.monotonic(),
    )


def test_bridge_stamps_cumulative_coins_per_user():
    bridge = Bridge("127.0.0.1", 0, 500, logging.getLogger("test-bridge"))
    sent = []

    async def record(payload):
        sent.append(payload)

    bridge._broadcast = record

    async def run():
        await bridge.publish_action(
            GiftAction("e1", _signal("u1", coins=1, repeat=1), 1, 1)
        )
        await bridge.publish_action(
            GiftAction("e2", _signal("u1", coins=1, repeat=9), 9, 9)
        )
        await bridge.publish_action(
            GiftAction("e3", _signal("u2", coins=200, repeat=1), 1, 200)
        )

    asyncio.run(run())

    # Total combo tetap per combo; cumulativeCoins yang naik per user.
    assert [m["gift"]["totalCoins"] for m in sent] == [1, 9, 200]
    assert [m["cumulativeCoins"] for m in sent] == [1, 10, 200]
    assert bridge._stats["totalCoins"] == 210
