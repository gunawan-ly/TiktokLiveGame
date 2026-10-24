from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from .normalizer import LikeSignal


@dataclass(frozen=True, slots=True)
class LikeAward:
    """A viewer earned a Zamrud print by reaching a like multiple."""

    user_id: str
    username: str
    display_name: str
    avatar_url: str
    like_total: int
    threshold: int
    multiple: int


class LikeTracker:
    """Aggregate likes per user; award a Zamrud print at EVERY multiple.

    Keputusan Awan (24 Okt 2026): cetakan diberikan di kelipatan ambang
    (500, 1.000, 1.500, ...), bukan hanya sekali, supaya penonton tetap
    semangat tap-tap sesudah cetakan pertama. Jeda menuju tiap kelipatan
    lumayan lama, jadi laju cetakan gratis tetap terkendali; penonton
    yang mau instan tetap memakai jalur gift. Totals are per connector
    session: a restart starts everyone from zero.
    """

    def __init__(self, threshold: int) -> None:
        self.threshold = max(1, int(threshold))
        self._totals: Dict[str, int] = {}
        self._multiples: Dict[str, int] = {}

    def add(self, signal: LikeSignal) -> List[LikeAward]:
        if signal is None or signal.like_count <= 0 or not signal.user_id:
            return []
        total = self._totals.get(signal.user_id, 0) + signal.like_count
        self._totals[signal.user_id] = total
        reached = total // self.threshold
        issued = self._multiples.get(signal.user_id, 0)
        if reached <= issued:
            return []
        awards = [
            LikeAward(
                user_id=signal.user_id,
                username=signal.username,
                display_name=signal.display_name,
                avatar_url=signal.avatar_url,
                like_total=total,
                threshold=self.threshold,
                multiple=multiple,
            )
            for multiple in range(issued + 1, reached + 1)
        ]
        self._multiples[signal.user_id] = reached
        return awards

    def total_for(self, user_id: str) -> int:
        return self._totals.get(user_id, 0)

    def has_awarded(self, user_id: str) -> bool:
        return self._multiples.get(user_id, 0) > 0

    @property
    def awarded_count(self) -> int:
        return sum(self._multiples.values())

    def reset(self) -> None:
        self._totals.clear()
        self._multiples.clear()
