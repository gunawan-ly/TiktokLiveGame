export const TIER_KEYS = ["bronze", "silver", "gold", "amethyst", "diamond"];

// Gift hanya memakai silver/gold/amethyst/diamond. Bronze khusus jalur like
// (frame avatar strip Top Tap-Tap) dan tidak pernah dihasilkan
// tierForCoins, supaya gift tidak pernah tercetak dengan bingkai perunggu.
export const GIFT_TIER_KEYS = ["silver", "gold", "amethyst", "diamond"];

export const DEFAULT_TIER_MIN = {
  bronze: 10,
  silver: 10,
  gold: 50,
  amethyst: 100,
  diamond: 200,
};

export const TIER_LABEL = {
  bronze: "BRONZE",
  silver: "SILVER",
  gold: "GOLD",
  amethyst: "AMETHYST",
  diamond: "DIAMOND",
  emerald: "EMERALD",
};

export const TIER_ACCENT = {
  standard: "#d8d0c2",
  bronze: "#cd7f32",
  silver: "#c9d6df",
  gold: "#f4d16a",
  amethyst: "#a78bfa",
  diamond: "#8be9ff",
  emerald: "#34d399",
};

function normalizeOneTier(key, input) {
  const raw = input?.[key];
  const candidate =
    typeof raw === "number"
      ? raw
      : Number(raw?.minCoins ?? DEFAULT_TIER_MIN[key]);
  const minimum = Number.isFinite(candidate) && candidate >= 0
    ? Math.floor(candidate)
    : DEFAULT_TIER_MIN[key];
  const label = String(raw?.label || TIER_LABEL[key]).trim().toUpperCase();
  return { minCoins: minimum, label };
}

export function normalizeTiers(input = {}) {
  const tiers = {};
  // Bronze jalur like dinormalisasi sendiri, tidak ikut rantai gift.
  tiers.bronze = normalizeOneTier("bronze", input);
  let previous = -1;
  for (const key of GIFT_TIER_KEYS) {
    const tier = normalizeOneTier(key, input);
    if (tier.minCoins <= previous) {
      tier.minCoins = previous + 1;
    }
    previous = tier.minCoins;
    tiers[key] = tier;
  }
  return tiers;
}

export function tierForCoins(totalCoins, tiers) {
  const coins = Number(totalCoins);
  if (!Number.isFinite(coins) || coins < (tiers?.silver?.minCoins ?? DEFAULT_TIER_MIN.silver)) {
    return "standard";
  }
  let tier = "standard";
  for (const key of GIFT_TIER_KEYS) {
    if (coins >= (tiers?.[key]?.minCoins ?? DEFAULT_TIER_MIN[key])) {
      tier = key;
    }
  }
  return tier;
}

export function tierLabel(tier, tiers) {
  if (tier === "standard") {
    return "";
  }
  return tiers?.[tier]?.label || TIER_LABEL[tier] || "";
}

export function tierAccent(tier) {
  return TIER_ACCENT[tier] || TIER_ACCENT.standard;
}

// Progres kemewahan Emerald (jalur like): level naik dari KELIPATAN
// ambang yang dicapai penonton dalam satu sesi (kelipatan 3, 6, 10).
// Kemewahan tumbuh lewat kekayaan bingkai (cincin lebih lebar dan
// dalam, chip nama, faset permata), BUKAN animasi: jalur gratis tidak
// boleh tampak lebih hidup dari gift berbayar (aturan Awan, 25 Okt 2026).
export function emeraldLevelFor(likeTotal, threshold) {
  const base = Math.max(1, Math.floor(Number(threshold) || 500));
  const multiple = Math.floor(Math.max(0, Number(likeTotal) || 0) / base);
  if (multiple >= 10) return 4;
  if (multiple >= 6) return 3;
  if (multiple >= 3) return 2;
  return 1;
}
