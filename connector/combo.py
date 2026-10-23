from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Dict, List

from .normalizer import GiftSignal


CLOSED_KEY_TTL_SECONDS = 30 * 60


@dataclass(frozen=True, slots=True)
class GiftAction:
    event_id: str
    signal: GiftSignal
    repeat: int
    total_coins: int

    def to_message(self) -> dict:
        return {
            "type": "gift",
            "eventId": self.event_id,
            "user": {
                "username": self.signal.username,
                "displayName": self.signal.display_name,
                "avatarUrl": self.signal.avatar_url,
            },
            "gift": {
                "id": self.signal.gift_id,
                "name": self.signal.gift_name,
                "repeat": self.repeat,
                "coinsPerItem": self.signal.coins_per_item,
                "totalCoins": self.total_coins,
            },
            "timestamp": self.signal.timestamp,
        }


class ComboAggregator:
    """Aggregate streak gifts and emit exactly one action per combo."""

    def __init__(self, timeout_seconds: float = 5.0) -> None:
        self.timeout_seconds = timeout_seconds
        self._pending: Dict[str, GiftSignal] = {}
        self._closed: Dict[str, float] = {}

    def _key(self, signal: GiftSignal) -> str:
        if signal.group_id:
            return f"group:{signal.group_id}"
        if signal.order_id:
            return (
                f"user:{signal.user_id}:gift:{signal.gift_id}:order:{signal.order_id}"
            )
        return (
            f"user:{signal.user_id}:gift:{signal.gift_id}:time:{signal.received_at:.3f}"
        )

    def _prune_closed(self, now: float) -> None:
        expired = [
            key
            for key, closed_at in self._closed.items()
            if now - closed_at > CLOSED_KEY_TTL_SECONDS
        ]
        for key in expired:
            self._closed.pop(key, None)

    def _finish(self, key: str, signal: GiftSignal) -> GiftAction:
        self._pending.pop(key, None)
        self._closed[key] = time.monotonic()
        repeat = max(1, signal.repeat_count)
        total_coins = repeat * max(0, signal.coins_per_item)
        event_id = (
            signal.order_id
            if signal.order_id and signal.group_id
            else f"combo-{uuid.uuid4().hex}"
        )
        return GiftAction(
            event_id=event_id,
            signal=signal,
            repeat=repeat,
            total_coins=total_coins,
        )

    def add(self, signal: GiftSignal) -> List[GiftAction]:
        now = time.monotonic()
        self._prune_closed(now)
        key = self._key(signal)

        if key in self._closed:
            return []

        if not signal.streakable:
            return [self._finish(key, signal)]

        previous = self._pending.get(key)
        if previous is not None:
            signal.repeat_count = max(previous.repeat_count, signal.repeat_count)
            # Keep the freshest identity fields while preserving totals.
            if not signal.avatar_url:
                signal.avatar_url = previous.avatar_url
            if not signal.display_name:
                signal.display_name = previous.display_name

        self._pending[key] = signal
        if signal.repeat_end:
            return [self._finish(key, signal)]
        return []

    def flush_expired(self, now: float | None = None) -> List[GiftAction]:
        current = time.monotonic() if now is None else now
        actions: List[GiftAction] = []
        for key, signal in list(self._pending.items()):
            if current - signal.received_at < self.timeout_seconds:
                continue
            actions.append(self._finish(key, signal))
        return actions

    @property
    def pending_count(self) -> int:
        return len(self._pending)
