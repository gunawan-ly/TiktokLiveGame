from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from urllib.parse import urlparse


MAX_NAME_LENGTH = 80


@dataclass(slots=True)
class GiftSignal:
    user_id: str
    username: str
    display_name: str
    avatar_url: str
    gift_id: int
    gift_name: str
    repeat_count: int
    coins_per_item: int
    group_id: int
    order_id: str
    repeat_end: bool
    streakable: bool
    timestamp: str = field(
        default_factory=lambda: datetime.now().astimezone().isoformat(timespec="seconds")
    )
    received_at: float = field(default_factory=time.monotonic)


def _read(obj: Any, name: str, default: Any = None) -> Any:
    if obj is None:
        return default
    try:
        value = getattr(obj, name, default)
    except Exception:
        return default
    return default if value is None else value


def _first_string(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        for item in value:
            if isinstance(item, str) and item:
                return item
    return ""


def _avatar_url(user: Any) -> str:
    if user is None:
        return ""

    for field_name in ("avatar_thumb", "avatar_medium", "avatar_large"):
        image = _read(user, field_name)
        if image is None:
            continue
        candidates = _read(image, "url_list", image)
        candidate = _first_string(candidates)
        if candidate:
            parsed = urlparse(candidate)
            if parsed.scheme in {"http", "https"} and parsed.netloc:
                return candidate

    direct = _read(user, "avatar_url", "")
    candidate = _first_string(direct)
    if candidate:
        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return candidate
    return ""


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _clean_text(value: Any, fallback: str, limit: int = MAX_NAME_LENGTH) -> str:
    text = str(value or "").strip()
    if not text:
        text = fallback
    return " ".join(text.split())[:limit]


def extract_gift_signal(event: Any) -> GiftSignal | None:
    """Convert a TikTokLive GiftEvent into the connector's canonical signal.

    The normalizer deliberately accepts objects as well as simple test
    namespaces. Missing fields are tolerated because TikTok's payload shape
    changes more often than our bridge contract.
    """

    gift = _read(event, "gift")
    user = _read(event, "user")
    if gift is None and user is None:
        return None

    gift_id = _safe_int(_read(gift, "id", _read(event, "gift_id", 0)))
    gift_name = _clean_text(
        _read(gift, "name", _read(event, "gift_name", "")),
        "Gift",
        40,
    )
    coins_per_item = max(
        0,
        _safe_int(
            _read(gift, "diamond_count", _read(event, "diamond_count", 0))
        ),
    )

    username = _clean_text(
        _read(user, "display_id", _read(user, "unique_id", "")),
        "viewer",
        40,
    )
    display_name = _clean_text(
        _read(user, "nickname", username),
        username,
    )
    user_id = _clean_text(
        _read(user, "id", _read(user, "user_id", username)),
        username,
        40,
    )

    repeat_count = max(1, _safe_int(_read(event, "repeat_count", 1), 1))
    group_id = _safe_int(_read(event, "group_id", 0))
    order_id = _clean_text(_read(event, "order_id", ""), "", 80)

    gift_type = _safe_int(_read(gift, "type", 0))
    streakable = bool(gift_type == 1 or _read(gift, "streakable", False))
    repeat_end = bool(_read(event, "repeat_end", 0)) or not streakable

    if gift_id <= 0 and not gift_name:
        return None

    return GiftSignal(
        user_id=user_id,
        username=username,
        display_name=display_name,
        avatar_url=_avatar_url(user),
        gift_id=gift_id,
        gift_name=gift_name,
        repeat_count=repeat_count,
        coins_per_item=coins_per_item,
        group_id=group_id,
        order_id=order_id,
        repeat_end=repeat_end,
        streakable=streakable,
    )


@dataclass(slots=True)
class LikeSignal:
    user_id: str
    username: str
    display_name: str
    avatar_url: str
    like_count: int


def extract_like_signal(event: Any) -> LikeSignal | None:
    """Convert a TikTokLive LikeEvent into a per-user like batch.

    `count` is the number of likes this event carries for this user.
    `total_like_count` is the ROOM total and must never be used here:
    the Emerald threshold counts likes per user, not per room.
    """

    user = _read(event, "user")
    if user is None:
        return None

    like_count = max(
        0,
        _safe_int(_read(event, "count", _read(event, "like_count", 0))),
    )
    if like_count <= 0:
        return None

    username = _clean_text(
        _read(user, "display_id", _read(user, "unique_id", "")),
        "viewer",
        40,
    )
    display_name = _clean_text(
        _read(user, "nickname", username),
        username,
    )
    user_id = _clean_text(
        _read(user, "id", _read(user, "user_id", username)),
        username,
        40,
    )

    return LikeSignal(
        user_id=user_id,
        username=username,
        display_name=display_name,
        avatar_url=_avatar_url(user),
        like_count=like_count,
    )


@dataclass(slots=True)
class JoinSignal:
    user_id: str
    username: str
    display_name: str
    avatar_url: str


@dataclass(slots=True)
class ShareSignal:
    user_id: str
    username: str
    display_name: str
    avatar_url: str


def extract_join_signal(event: Any) -> JoinSignal | None:
    """Convert a TikTokLive JoinEvent into a join signal.

    JoinEvent adalah WebcastMemberMessage (penonton masuk room). Hanya
    identitas penonton yang dipakai untuk popup sambutan; event ini tidak
    membawa hitungan apa pun dan tidak memengaruhi statistik sesi.
    """

    user = _read(event, "user")
    if user is None:
        return None

    username = _clean_text(
        _read(user, "display_id", _read(user, "unique_id", "")),
        "viewer",
        40,
    )
    display_name = _clean_text(
        _read(user, "nickname", username),
        username,
    )
    user_id = _clean_text(
        _read(user, "id", _read(user, "user_id", username)),
        username,
        40,
    )

    return JoinSignal(
        user_id=user_id,
        username=username,
        display_name=display_name,
        avatar_url=_avatar_url(user),
    )


def extract_share_signal(event: Any) -> ShareSignal | None:
    """Convert a TikTokLive ShareEvent into a per-user share signal.

    ShareEvent adalah SocialEvent (WebcastSocialMessage) dengan field
    `user` yang sama seperti LikeEvent/JoinEvent (terverifikasi dari
    source TikTokLive 7.0.1). Satu event dihitung SATU share untuk
    penonton itu. Proto membawa `share_type`/`share_target`, tapi makna
    nilainya tidak terdokumentasi, dan `share_count` kemungkinan total
    ruangan/user (jebakan yang sama seperti total like ruangan): dua-
    duanya TIDAK dipakai. Semua jenis bagikan (salin tautan maupun ke
    teman) dihitung sama, sesuai keputusan Awan 25 Okt 2026.
    """

    user = _read(event, "user")
    if user is None:
        return None

    username = _clean_text(
        _read(user, "display_id", _read(user, "unique_id", "")),
        "viewer",
        40,
    )
    display_name = _clean_text(
        _read(user, "nickname", username),
        username,
    )
    user_id = _clean_text(
        _read(user, "id", _read(user, "user_id", username)),
        username,
        40,
    )

    return ShareSignal(
        user_id=user_id,
        username=username,
        display_name=display_name,
        avatar_url=_avatar_url(user),
    )
