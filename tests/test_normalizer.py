from types import SimpleNamespace

from connector.normalizer import extract_gift_signal


def event(**overrides):
    user = SimpleNamespace(
        id="123",
        display_id="awanbalango",
        nickname="Awan",
        avatar_thumb=SimpleNamespace(
            url_list=["https://cdn.example.com/avatar.webp"]
        ),
    )
    gift = SimpleNamespace(id=5655, name="Rose", diamond_count=1, type=1)
    base = SimpleNamespace(
        user=user,
        gift=gift,
        repeat_count=1,
        repeat_end=0,
        group_id=987,
        order_id="order-1",
    )
    for key, value in overrides.items():
        setattr(base, key, value)
    return base


def test_extracts_canonical_fields():
    signal = extract_gift_signal(event(repeat_count=20, repeat_end=1))

    assert signal is not None
    assert signal.username == "awanbalango"
    assert signal.display_name == "Awan"
    assert signal.avatar_url == "https://cdn.example.com/avatar.webp"
    assert signal.gift_name == "Rose"
    assert signal.repeat_count == 20
    assert signal.coins_per_item == 1
    assert signal.repeat_end is True


def test_empty_avatar_is_allowed():
    user = SimpleNamespace(
        id="123",
        display_id="awan",
        nickname="Awan",
        avatar_thumb=None,
        avatar_medium=None,
        avatar_large=None,
    )
    signal = extract_gift_signal(event(user=user))

    assert signal is not None
    assert signal.avatar_url == ""


def test_unsafe_avatar_scheme_is_rejected():
    user = SimpleNamespace(
        id="123",
        display_id="awan",
        nickname="Awan",
        avatar_thumb=SimpleNamespace(url_list=["javascript:alert(1)"]),
    )
    signal = extract_gift_signal(event(user=user))

    assert signal is not None
    assert signal.avatar_url == ""


def test_non_streakable_gift_is_immediately_finished():
    gift = SimpleNamespace(id=1, name="Rose", diamond_count=1, type=0)
    signal = extract_gift_signal(event(gift=gift, repeat_count=1, repeat_end=0))

    assert signal is not None
    assert signal.streakable is False
    assert signal.repeat_end is True


def test_missing_objects_return_none():
    empty = SimpleNamespace(user=None, gift=None)
    assert extract_gift_signal(empty) is None


def test_names_are_normalized_and_limited():
    user = SimpleNamespace(
        id="123",
        display_id="  Awan   Studio  ",
        nickname="  Nama   Yang   Sangat   Panjang " * 4,
        avatar_thumb=None,
    )
    signal = extract_gift_signal(event(user=user))

    assert signal is not None
    assert signal.username == "Awan Studio"
    assert len(signal.display_name) == 80
