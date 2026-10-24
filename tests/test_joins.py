import asyncio
import logging
from types import SimpleNamespace

from connector.bridge import Bridge
from connector.normalizer import extract_join_signal


def join_event(**user_overrides):
    user = SimpleNamespace(
        id="123",
        display_id="awanbalango",
        nickname="Awan",
        avatar_thumb=SimpleNamespace(
            url_list=["https://cdn.example.com/avatar.webp"]
        ),
    )
    for key, value in user_overrides.items():
        setattr(user, key, value)
    return SimpleNamespace(user=user)


def test_extracts_join_identity():
    signal = extract_join_signal(join_event())

    assert signal is not None
    assert signal.user_id == "123"
    assert signal.username == "awanbalango"
    assert signal.display_name == "Awan"
    assert signal.avatar_url == "https://cdn.example.com/avatar.webp"


def test_join_without_user_is_ignored():
    assert extract_join_signal(SimpleNamespace(user=None)) is None
    assert extract_join_signal(SimpleNamespace()) is None


def test_bridge_publishes_join_once_per_user_per_session():
    bridge = Bridge("127.0.0.1", 0, 500, logging.getLogger("test-join"))
    sent = []

    async def record(payload):
        sent.append(payload)

    bridge._broadcast = record
    signal = extract_join_signal(join_event())
    other = extract_join_signal(join_event(id="999", display_id="lain", nickname="Lain"))

    async def run():
        first = await bridge.publish_join(signal, "runA")
        dupe = await bridge.publish_join(signal, "runA")
        another = await bridge.publish_join(other, "runA")
        return first, dupe, another

    assert asyncio.run(run()) == (True, False, True)
    assert [m["type"] for m in sent] == ["join", "join"]
    assert sent[0]["eventId"] == "join-runA-123"
    assert sent[0]["user"]["displayName"] == "Awan"
    assert sent[0]["user"]["avatarUrl"] == "https://cdn.example.com/avatar.webp"
    # Popup join tidak menyentuh statistik cetakan/koin.
    assert bridge._stats["printed"] == 0
    assert bridge._stats["totalCoins"] == 0
