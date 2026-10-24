from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Set

from .normalizer import LikeSignal


@dataclass(frozen=True, slots=True)
class LikeAward:
    """A viewer earned the one Zamrud print for this connector session."""

    user_id: str
    username: str
    display_name: str
    avatar_url: str
    like_total: int
    threshold: int


class LikeTracker:
    """Aggregate likes per user and award one Zamrud print per session.

    tap-tap is the engagement engine of the live, so the reward must stay
    exclusive: the threshold is high (default 500) and each user can
    earn it only once per connector session. A connector restart starts
    a new session with fresh totals, which is intentional: a new live
    means a new chance.
    """

    def __init__(self, threshold: int) -> None:
        self.threshold = max(1, int(threshold))
        self._totals: Dict[str, int] = {}
        self._awarded: Set[str] = set()

    def add(self, signal: LikeSignal) -> Optional[LikeAward]:
        if signal is None or signal.like_count <= 0 or not signal.user_id:
            return None
        total = self._totals.get(signal.user_id, 0) + signal.like_count
        self._totals[signal.user_id] = total
        if signal.user_id in self._awarded or total < self.threshold:
            return None
        self._awarded.add(signal.user_id)
        return LikeAward(
            user_id=signal.user_id,
            username=signal.username,
            display_name=signal.display_name,
            avatar_url=signal.avatar_url,
            like_total=total,
            threshold=self.threshold,
        )

    def total_for(self, user_id: str) -> int:
        return self._totals.get(user_id, 0)

    def has_awarded(self, user_id: str) -> bool:
        return user_id in self._awarded

    @property
    def awarded_count(self) -> int:
        return len(self._awarded)

    def reset(self) -> None:
        self._totals.clear()
        self._awarded.clear()
