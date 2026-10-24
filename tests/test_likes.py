from types import SimpleNamespace

from connector.likes import LikeTracker
from connector.normalizer import LikeSignal, extract_like_signal


def like_event(count=1, user_id="123", total_like_count=999999):
    user = SimpleNamespace(
        id=user_id,
        display_id="pengetuk",
        nickname="Pengetuk Setia",
        avatar_thumb=SimpleNamespace(
            url_list=["https://cdn.example.com/avatar.webp"]
        ),
    )
    return SimpleNamespace(
        user=user,
        count=count,
        total_like_count=total_like_count,
    )


def signal(user_id="123", count=10):
    return LikeSignal(
        user_id=user_id,
        username="pengetuk",
        display_name="Pengetuk Setia",
        avatar_url="https://cdn.example.com/avatar.webp",
        like_count=count,
    )


def test_extract_like_signal_uses_per_user_count_not_room_total():
    result = extract_like_signal(like_event(count=7, total_like_count=50000))

    assert result is not None
    assert result.like_count == 7
    assert result.user_id == "123"
    assert result.username == "pengetuk"
    assert result.display_name == "Pengetuk Setia"
    assert result.avatar_url == "https://cdn.example.com/avatar.webp"


def test_extract_like_signal_rejects_empty_batches():
    assert extract_like_signal(like_event(count=0)) is None
    assert extract_like_signal(SimpleNamespace(count=5)) is None


def test_tracker_awards_exactly_once_at_threshold():
    tracker = LikeTracker(100)

    assert tracker.add(signal(count=60)) is None
    award = tracker.add(signal(count=40))

    assert award is not None
    assert award.like_total == 100
    assert award.threshold == 100
    assert tracker.has_awarded("123") is True
    # Like berikutnya tidak memicu cetak kedua di sesi yang sama.
    assert tracker.add(signal(count=500)) is None
    assert tracker.total_for("123") == 600
    assert tracker.awarded_count == 1


def test_tracker_counts_users_independently():
    tracker = LikeTracker(50)

    assert tracker.add(signal(user_id="a", count=49)) is None
    assert tracker.add(signal(user_id="b", count=50)) is not None
    assert tracker.add(signal(user_id="a", count=1)) is not None
    assert tracker.awarded_count == 2


def test_tracker_ignores_invalid_signals_and_resets():
    tracker = LikeTracker(10)

    assert tracker.add(signal(count=0)) is None
    assert tracker.total_for("123") == 0

    tracker.add(signal(count=10))
    assert tracker.has_awarded("123") is True
    tracker.reset()
    assert tracker.total_for("123") == 0
    assert tracker.has_awarded("123") is False
    # Sesi baru = kesempatan baru.
    assert tracker.add(signal(count=10)) is not None
