import time

from connector.combo import ComboAggregator
from connector.normalizer import GiftSignal


def make_signal(
    *,
    repeat=1,
    repeat_end=False,
    streakable=True,
    group_id=101,
    gift_id=5655,
    coins=1,
    user_id="u1",
    username="awan",
    order_id="",
    received_at=None,
):
    return GiftSignal(
        user_id=user_id,
        username=username,
        display_name="Awan",
        avatar_url="https://example.com/a.webp",
        gift_id=gift_id,
        gift_name="Mawar",
        repeat_count=repeat,
        coins_per_item=coins,
        group_id=group_id,
        order_id=order_id,
        repeat_end=repeat_end,
        streakable=streakable,
        received_at=time.monotonic() if received_at is None else received_at,
    )


def test_combo_waits_for_repeat_end_and_emits_once():
    aggregator = ComboAggregator()

    assert aggregator.add(make_signal(repeat=1)) == []
    assert aggregator.add(make_signal(repeat=5)) == []
    actions = aggregator.add(make_signal(repeat=20, repeat_end=True))

    assert len(actions) == 1
    assert actions[0].repeat == 20
    assert actions[0].total_coins == 20
    assert actions[0].signal.display_name == "Awan"
    assert aggregator.pending_count == 0


def test_duplicate_repeat_end_is_ignored():
    aggregator = ComboAggregator()

    assert len(aggregator.add(make_signal(repeat=20, repeat_end=True))) == 1
    assert aggregator.add(make_signal(repeat=20, repeat_end=True)) == []


def test_non_streakable_gift_emits_immediately():
    aggregator = ComboAggregator()
    actions = aggregator.add(
        make_signal(repeat=1, repeat_end=True, streakable=False, group_id=0)
    )

    assert len(actions) == 1
    assert actions[0].repeat == 1


def test_out_of_order_repeat_count_keeps_highest_value():
    aggregator = ComboAggregator()

    aggregator.add(make_signal(repeat=15))
    actions = aggregator.add(make_signal(repeat=8, repeat_end=True))

    assert actions[0].repeat == 15
    assert actions[0].total_coins == 15


def test_expired_combo_is_flushed_once():
    aggregator = ComboAggregator(timeout_seconds=3)
    old = time.monotonic() - 10

    assert aggregator.add(make_signal(repeat=7, received_at=old)) == []
    actions = aggregator.flush_expired()
    assert len(actions) == 1
    assert actions[0].repeat == 7
    assert aggregator.flush_expired() == []


def test_separate_groups_stay_separate():
    aggregator = ComboAggregator()

    aggregator.add(make_signal(group_id=1, repeat=4))
    aggregator.add(make_signal(group_id=2, repeat=9))
    actions = aggregator.add(make_signal(group_id=2, repeat=10, repeat_end=True))

    assert len(actions) == 1
    assert actions[0].repeat == 10
    assert aggregator.pending_count == 1


def test_action_message_matches_bridge_schema():
    aggregator = ComboAggregator()
    action = aggregator.add(make_signal(repeat=5, repeat_end=True))[0]
    message = action.to_message()

    assert message["type"] == "gift"
    assert message["user"]["username"] == "awan"
    assert message["gift"]["repeat"] == 5
    assert message["gift"]["coinsPerItem"] == 1
    assert message["gift"]["totalCoins"] == 5
    assert message["eventId"]
