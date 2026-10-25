from __future__ import annotations

from typing import Dict


class CoinLedger:
    """Per-user cumulative gift coins for one connector session.

    Keputusan Awan (24 Okt 2026): kelas bingkai gift mengikuti TOTAL
    akumulasi koin per penonton dalam satu sesi, bukan hanya total satu
    combo, supaya gift kecil yang dicicil tetap menaikkan kelas bingkai
    penonton setia. Combo tetap menjadi pemicu cetak (satu combo selesai
    = satu cetakan); ledger hanya menentukan kelas bingkainya, dihitung
    termasuk combo yang baru selesai. Restart connector = sesi baru,
    semua total kembali ke nol, sama seperti hitungan like Emerald.
    """

    def __init__(self) -> None:
        self._totals: Dict[str, int] = {}

    def add(self, user_id: str, coins: int) -> int:
        """Add coins to a user's session total; return the new total."""
        if not user_id:
            return 0
        total = self._totals.get(user_id, 0) + max(0, int(coins))
        self._totals[user_id] = total
        return total

    def total_for(self, user_id: str) -> int:
        return self._totals.get(user_id, 0)

    def reset(self) -> None:
        self._totals.clear()
