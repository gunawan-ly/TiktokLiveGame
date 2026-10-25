import asyncio
import logging
from types import SimpleNamespace

from connector.bridge import Bridge
from connector.normalizer import ShareSignal, extract_share_signal
from connector.shares import ShareTracker


def share_event(**user_overrides):
    user = SimpleNamespace(
        id="777",
        display_id="sinta.share",
        nickname="Sinta",
        avatar_thumb=SimpleNamespace(
            url_list=["https://cdn.example.com/sinta.webp"]
        ),
    )
    for key, value in user_overrides.items():
        setattr(user, key, value)
    return SimpleNamespace(user=user)


def signal_for(user_id="777", username="sinta.share", display_name="Sinta"):
    return ShareSignal(
        user_id=user_id,
        username=username,
        display_name=display_name,
        avatar_url="",
    )


def test_extracts_share_identity():
    signal = extract_share_signal(share_event())

    assert signal is not None
    assert signal.user_id == "777"
    assert signal.username == "sinta.share"
    assert signal.display_name == "Sinta"
    assert signal.avatar_url == "https://cdn.example.com/sinta.webp"


def test_share_without_user_is_ignored():
    assert extract_share_signal(SimpleNamespace(user=None)) is None
    assert extract_share_signal(SimpleNamespace()) is None


def test_tracker_awards_at_five_and_ten():
    tracker = ShareTracker(5)
    signal = signal_for()

    awards = []
    for _ in range(12):
        awards += tracker.add(signal)

    assert [a.multiple for a in awards] == [1, 2]
    assert [a.share_total for a in awards] == [5, 10]
    assert tracker.total_for("777") == 12
    assert tracker.awarded_count == 2


def test_tracker_keeps_users_separate_and_resets():
    tracker = ShareTracker(5)
    for _ in range(5):
        tracker.add(signal_for())
    assert tracker.add(signal_for(user_id="888", username="lain")) == []
    assert tracker.total_for("888") == 1

    tracker.reset()
    assert tracker.total_for("777") == 0
    assert tracker.awarded_count == 0


def test_bridge_publishes_ruby_with_deterministic_id_and_stats():
    bridge = Bridge("127.0.0.1", 0, 500, logging.getLogger("test-ruby"))
    sent = []

    async def record(payload):
        sent.append(payload)

    bridge._broadcast = record
    tracker = ShareTracker(5)
    signal = signal_for()

    async def run():
        for _ in range(10):
            for award in tracker.add(signal):
                await bridge.publish_ruby(award, "runA")

    asyncio.run(run())
    assert [m["type"] for m in sent] == ["ruby_print", "ruby_print"]
    assert sent[0]["eventId"] == "ruby-runA-777-1"
    assert sent[1]["eventId"] == "ruby-runA-777-2"
    assert sent[0]["shareTotal"] == 5
    assert sent[1]["shareTotal"] == 10
    assert sent[0]["user"]["displayName"] == "Sinta"
    # Ruby menambah cetakan, tidak pernah menambah koin.
    assert bridge._stats["printed"] == 2
    assert bridge._stats["totalCoins"] == 0
