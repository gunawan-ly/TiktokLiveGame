export const DEFAULT_CONFIG = {
  title: "STUDIO PHOTO",
  subtitle: "LIVE PHOTO BOOTH",
  targetCoins: 500,
  wsUrl: "ws://127.0.0.1:8080",
  maxActivePhotos: 9,
  maxRollPhotos: 7,
  printDurationMs: 2000,
  toastDurationMs: 5000,
  diamondToastExtraMs: 2000,
  tiers: {
    bronze: { minCoins: 10, label: "PERUNGGU" },
    silver: { minCoins: 100, label: "PERAK" },
    gold: { minCoins: 500, label: "EMAS" },
    diamond: { minCoins: 5000, label: "BERLIAN" },
  },
  sound: {
    enabled: false,
    volume: 0.25,
  },
};

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, number));
}

function flagEnabled(value) {
  return value === "1" || value === "true" || value === "yes";
}

export async function loadGameConfig() {
  let fileConfig = {};
  try {
    const url = new URL("../../config/game.json", import.meta.url);
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object") {
        fileConfig = parsed;
      }
    } else {
      console.warn("Config game tidak ditemukan, memakai default.");
    }
  } catch (error) {
    console.warn("Gagal memuat config game, memakai default:", error);
  }

  const merged = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    sound: { ...DEFAULT_CONFIG.sound, ...(fileConfig.sound || {}) },
    tiers: { ...DEFAULT_CONFIG.tiers, ...(fileConfig.tiers || {}) },
  };

  const params = new URLSearchParams(window.location.search);
  if (params.get("ws")) {
    merged.wsUrl = params.get("ws");
  }
  if (params.get("title")) {
    merged.title = params.get("title");
  }
  if (params.get("subtitle")) {
    merged.subtitle = params.get("subtitle");
  }
  if (params.get("target")) {
    merged.targetCoins = Number(params.get("target"));
  }
  if (params.get("duration")) {
    merged.printDurationMs = Number(params.get("duration"));
  }
  if (params.get("toast")) {
    merged.toastDurationMs = Number(params.get("toast"));
  }
  if (params.has("sound")) {
    merged.sound.enabled = flagEnabled(params.get("sound"));
  }

  merged.targetCoins = Math.round(clamp(merged.targetCoins, 1, 1_000_000_000, 500));
  merged.maxActivePhotos = Math.round(clamp(merged.maxActivePhotos, 1, 9, 9));
  merged.maxRollPhotos = Math.round(clamp(merged.maxRollPhotos, 1, 12, 7));
  merged.printDurationMs = Math.round(clamp(merged.printDurationMs, 1200, 4000, 2000));
  merged.toastDurationMs = Math.round(clamp(merged.toastDurationMs, 3000, 12000, 5000));
  merged.diamondToastExtraMs = Math.round(
    clamp(merged.diamondToastExtraMs, 0, 6000, 2000),
  );
  merged.sound.volume = clamp(merged.sound.volume, 0, 1, 0.25);
  merged.debug = params.has("debug") && flagEnabled(params.get("debug"));
  merged.simulate = params.has("sim") && flagEnabled(params.get("sim"));

  return merged;
}
