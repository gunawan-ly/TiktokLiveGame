from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass

from .bridge import Bridge
from .combo import ComboAggregator
from .normalizer import GiftSignal, JoinSignal, ShareSignal
from .shares import ShareTracker


@dataclass(frozen=True, slots=True)
class MockScenario:
    username: str
    display_name: str
    gift_name: str
    gift_id: int
    repeat: int
    coins_per_item: int
    avatar: int | None
    broken_avatar: bool = False


SCENARIOS = (
    MockScenario("awanbalango", "Awan", "Mawar", 5655, 1, 1, 1),
    MockScenario("lyra.studio", "Lyra", "Mawar", 5655, 20, 1, 2),
    MockScenario("tings", "Tings", "Perfume", 5658, 5, 20, 3),
    MockScenario("royjr7", "Roy jr7", "Money Gun", 6200, 1, 500, 4),
    MockScenario("mbil.fan", "Mbil", "Lion", 9007, 1, 29999, 5),
    MockScenario("wendri", "Wendri", "Mawar", 5655, 2, 1, 6),
    MockScenario("foto.rusak", "Avatar Rusak", "Mawar", 5655, 1, 1, None, True),
    MockScenario("ash", "Ash", "Makeup Brush", 5665, 30, 1, 7),
    MockScenario("rifa", "Rifa", "Perfume", 5658, 6, 20, 8),
    MockScenario("johan", "Johan", "Money Gun", 6200, 2, 500, 1),
)


class MockFeed:
    def __init__(
        self,
        bridge: Bridge,
        aggregator: ComboAggregator,
        overlay_origin: str,
        logger: logging.Logger,
        interval: float = 4.0,
        run_id: str = "mock",
    ) -> None:
        self.bridge = bridge
        self.aggregator = aggregator
        self.overlay_origin = overlay_origin.rstrip("/")
        self.logger = logger
        self.interval = max(0.8, interval)
        self.run_id = run_id
        self._group_id = 1000
        # Persona pembagi setia untuk demo Ruby: satu share per siklus,
        # jadi cetakan Ruby muncul di kelipatan 5 dan 10 secara alami.
        self._share_tracker = ShareTracker(5)
        self._sharer = MockScenario("sinta.share", "Sinta", "Mawar", 5655, 1, 1, 3)

    def _avatar_url(self, index: int | None) -> str:
        if index is None:
            return ""
        return f"{self.overlay_origin}/overlay/assets/avatars/avatar-{index}.svg"

    def _next_group(self) -> int:
        self._group_id += 1
        return self._group_id

    def _signal(
        self,
        scenario: MockScenario,
        repeat: int,
        repeat_end: bool,
        group_id: int,
    ) -> GiftSignal:
        return GiftSignal(
            user_id=scenario.username,
            username=scenario.username,
            display_name=scenario.display_name,
            avatar_url=(
                "https://invalid.local/avatar-tidak-ada.webp"
                if scenario.broken_avatar
                else self._avatar_url(scenario.avatar)
            ),
            gift_id=scenario.gift_id,
            gift_name=scenario.gift_name,
            repeat_count=repeat,
            coins_per_item=scenario.coins_per_item,
            group_id=group_id,
            order_id=f"mock-{group_id}",
            repeat_end=repeat_end,
            streakable=scenario.repeat > 1,
        )

    async def _emit(self, scenario: MockScenario) -> None:
        group_id = self._next_group()
        if scenario.repeat > 1:
            await self._emit_actions(
                self.aggregator.add(self._signal(scenario, 1, False, group_id))
            )
            await asyncio.sleep(0.7)
        await self._emit_actions(
            self.aggregator.add(
                self._signal(scenario, scenario.repeat, True, group_id)
            )
        )

    async def _emit_actions(self, actions) -> None:
        for action in actions:
            await self.bridge.publish_action(action)

    async def run(self, stop: asyncio.Event) -> None:
        await self.bridge.set_status("mock", "mock feed aktif")
        self.logger.info("Mock feed aktif. Overlay akan menerima gift contoh.")
        index = 0
        while not stop.is_set():
            scenario = SCENARIOS[index % len(SCENARIOS)]
            index += 1
            try:
                # Persona "masuk room" dulu sebelum gift pertamanya; bridge
                # hanya menerbitkan popup join sekali per user per sesi.
                await self.bridge.publish_join(
                    JoinSignal(
                        user_id=scenario.username,
                        username=scenario.username,
                        display_name=scenario.display_name,
                        avatar_url=self._avatar_url(scenario.avatar),
                    ),
                    self.run_id,
                )
                await self._emit(scenario)
            except Exception:
                self.logger.exception("Mock feed gagal mengirim gift")

            try:
                awards = self._share_tracker.add(
                    ShareSignal(
                        user_id=self._sharer.username,
                        username=self._sharer.username,
                        display_name=self._sharer.display_name,
                        avatar_url=self._avatar_url(self._sharer.avatar),
                    )
                )
                for award in awards:
                    await self.bridge.publish_ruby(award, self.run_id)
            except Exception:
                self.logger.exception("Mock feed gagal mengirim Ruby")

            if index % 5 == 0:
                burst = random.sample(SCENARIOS[:6], k=2)
                for extra in burst:
                    await self._emit_actions(
                        self.aggregator.add(
                            GiftSignal(
                                user_id=extra.username,
                                username=extra.username,
                                display_name=extra.display_name,
                                avatar_url=self._avatar_url(extra.avatar),
                                gift_id=extra.gift_id,
                                gift_name=extra.gift_name,
                                repeat_count=extra.repeat,
                                coins_per_item=extra.coins_per_item,
                                group_id=0,
                                order_id="",
                                repeat_end=True,
                                streakable=False,
                            )
                        )
                    )
                    await asyncio.sleep(0.25)

            try:
                await asyncio.wait_for(stop.wait(), timeout=self.interval)
            except TimeoutError:
                continue
