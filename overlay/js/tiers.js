export const TIER_KEYS = ["bronze", "silver", "gold", "diamond"];

export const DEFAULT_TIER_MIN = {
  bronze: 10,
  silver: 100,
  gold: 500,
  diamond: 5000,
};

export const TIER_LABEL = {
  bronze: "PERUNGGU",
  silver: "PERAK",
  gold: "EMAS",
  diamond: "BERLIAN",
};

export const TIER_ACCENT = {
  standard: "#d8d0c2",
  bronze: "#cd7f32",
  silver: "#c9d6df",
  gold: "#f4d16a",
  diamond: "#8be9ff",
};

export function normalizeTiers(input = {}) {
  const tiers = {};
  let previous = -1;
  for (const key of TIER_KEYS) {
    const raw = input?.[key];
    const candidate =
      typeof raw === "number"
        ? raw
        : Number(raw?.minCoins ?? DEFAULT_TIER_MIN[key]);
    let minimum = Number.isFinite(candidate) && candidate >= 0
      ? Math.floor(candidate)
      : DEFAULT_TIER_MIN[key];
    if (minimum <= previous) {
      minimum = previous + 1;
    }
    previous = minimum;
    const label = String(raw?.label || TIER_LABEL[key]).trim().toUpperCase();
    tiers[key] = { minCoins: minimum, label };
  }
  return tiers;
}

export function tierForCoins(totalCoins, tiers) {
  const coins = Number(totalCoins);
  if (!Number.isFinite(coins) || coins < (tiers?.bronze?.minCoins ?? DEFAULT_TIER_MIN.bronze)) {
    return "standard";
  }
  let tier = "standard";
  for (const key of TIER_KEYS) {
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
