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


def test_tracker_awards_at_every_multiple():
    tracker = LikeTracker(100)

    assert tracker.add(signal(count=60)) == []
    awards = tracker.add(signal(count=40))

    assert len(awards) == 1
    assert awards[0].like_total == 100
    assert awards[0].threshold == 100
    assert awards[0].multiple == 1
    assert tracker.has_awarded("123") is True
    # Di antara kelipatan tidak ada cetakan...
    assert tracker.add(signal(count=50)) == []
    # ...tapi kelipatan berikutnya mencetak lagi.
    awards = tracker.add(signal(count=50))
    assert len(awards) == 1
    assert awards[0].multiple == 2
    assert awards[0].like_total == 200
    assert tracker.total_for("123") == 200
    assert tracker.awarded_count == 2


def test_tracker_batch_can_cross_two_multiples():
    tracker = LikeTracker(10)

    awards = tracker.add(signal(count=25))

    assert [award.multiple for award in awards] == [1, 2]
    assert tracker.awarded_count == 2


def test_tracker_counts_users_independently():
    tracker = LikeTracker(50)

    assert tracker.add(signal(user_id="a", count=49)) == []
    assert len(tracker.add(signal(user_id="b", count=50))) == 1
    assert len(tracker.add(signal(user_id="a", count=1))) == 1
    assert tracker.awarded_count == 2


def test_tracker_ignores_invalid_signals_and_resets():
    tracker = LikeTracker(10)

    assert tracker.add(signal(count=0)) == []
    assert tracker.total_for("123") == 0

    tracker.add(signal(count=10))
    assert tracker.has_awarded("123") is True
    tracker.reset()
    assert tracker.total_for("123") == 0
    assert tracker.has_awarded("123") is False
    # Sesi baru = kesempatan baru.
    assert len(tracker.add(signal(count=10))) == 1
