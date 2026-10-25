from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

from .normalizer import ShareSignal


@dataclass(frozen=True, slots=True)
class ShareAward:
    """A viewer earned a Ruby print by reaching a share multiple."""

    user_id: str
    username: str
    display_name: str
    avatar_url: str
    share_total: int
    threshold: int
    multiple: int


class ShareTracker:
    """Aggregate shares per user; award a Ruby print at EVERY multiple.

    Keputusan Awan (25 Okt 2026): ambang 5 share, cetakan di setiap
    kelipatan (5, 10, 15, ...). Ruby punya dua level: kelipatan pertama
    (5 share) level 1, kelipatan kedua dan seterusnya (10+) level 2;
    level dihitung overlay dari total share. Share dihitung per event
    (satu ShareEvent = satu share), semua jenis bagikan sama. Totals
    are per connector session: a restart starts everyone from zero.
    """

    def __init__(self, threshold: int) -> None:
        self.threshold = max(1, int(threshold))
        self._totals: Dict[str, int] = {}
        self._multiples: Dict[str, int] = {}

    def add(self, signal: ShareSignal) -> List[ShareAward]:
        if signal is None or not signal.user_id:
            return []
        total = self._totals.get(signal.user_id, 0) + 1
        self._totals[signal.user_id] = total
        reached = total // self.threshold
        issued = self._multiples.get(signal.user_id, 0)
        if reached <= issued:
            return []
        awards = [
            ShareAward(
                user_id=signal.user_id,
                username=signal.username,
                display_name=signal.display_name,
                avatar_url=signal.avatar_url,
                share_total=total,
                threshold=self.threshold,
                multiple=multiple,
            )
            for multiple in range(issued + 1, reached + 1)
        ]
        self._multiples[signal.user_id] = reached
        return awards

    def total_for(self, user_id: str) -> int:
        return self._totals.get(user_id, 0)

    @property
    def awarded_count(self) -> int:
        return sum(self._multiples.values())

    def reset(self) -> None:
        self._totals.clear()
        self._multiples.clear()
