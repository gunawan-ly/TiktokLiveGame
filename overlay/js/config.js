export const DEFAULT_CONFIG = {
  title: "STUDIO PHOTO",
  subtitle: "LIVE PHOTO BOOTH",
  targetCoins: 500,
  wsUrl: "ws://127.0.0.1:8080",
  maxActivePhotos: 9,
  maxRollPhotos: 7,
  maxQueueItems: 100,
  senderGapMs: 4000,
  printDurationMs: 2000,
  toastDurationMs: 5000,
  diamondToastExtraMs: 2000,
  tiers: {
    bronze: { minCoins: 10, label: "PERUNGGU" },
    silver: { minCoins: 10, label: "PERAK" },
    gold: { minCoins: 50, label: "EMAS" },
    diamond: { minCoins: 200, label: "BERLIAN" },
  },
  sound: {
    enabled: false,
    volume: 0.4,
  },
  music: {
    enabled: false,
    volume: 0.15,
    tracks: ["./assets/music/calm-lofi.mp3", "./assets/music/haru-lofi.mp3"],
  },
  ticker: {
    enabled: true,
    speed: 55,
    messages: [
      "Gift Mawar = cetak foto profilmu di Studio Photo",
      "Tap-tap 500 like = cetak foto bingkai Zamrud",
      "Total gift 10 koin = bingkai Perak, 50 koin = Emas, 200 koin = Berlian",
      "Follow biar tidak ketinggalan live Studio Photo berikutnya",
    ],
  },
  tickerCredits: {
    enabled: true,
    speed: 55,
    messages: ["♫ Backsound: Calm (Alex-Productions) • Haru (Roa Music) • CC BY"],
  },
  // Ambang Zamrud dibaca connector dari config/game.json; overlay hanya
  // meneruskannya supaya satu file tetap jadi sumber kebenaran bersama.
  engagement: {
    likeThreshold: 1000,
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
    music: { ...DEFAULT_CONFIG.music, ...(fileConfig.music || {}) },
    ticker: { ...DEFAULT_CONFIG.ticker, ...(fileConfig.ticker || {}) },
    tickerCredits: {
      ...DEFAULT_CONFIG.tickerCredits,
      ...(fileConfig.tickerCredits || {}),
    },
    engagement: {
      ...DEFAULT_CONFIG.engagement,
      ...(fileConfig.engagement || {}),
    },
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
  if (params.get("queue")) {
    merged.maxQueueItems = Number(params.get("queue"));
  }
  if (params.get("gap")) {
    merged.senderGapMs = Number(params.get("gap"));
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
  if (params.has("music")) {
    merged.music.enabled = flagEnabled(params.get("music"));
  }
  if (params.has("ticker")) {
    merged.ticker.enabled = flagEnabled(params.get("ticker"));
  }
  if (params.has("tickerCredits")) {
    merged.tickerCredits.enabled = flagEnabled(params.get("tickerCredits"));
  }

  merged.targetCoins = Math.round(clamp(merged.targetCoins, 1, 1_000_000_000, 500));
  merged.maxActivePhotos = Math.round(clamp(merged.maxActivePhotos, 1, 9, 9));
  merged.maxRollPhotos = Math.round(clamp(merged.maxRollPhotos, 1, 12, 7));
  merged.maxQueueItems = Math.round(clamp(merged.maxQueueItems, 1, 1000, 100));
  merged.senderGapMs = Math.round(clamp(merged.senderGapMs, 0, 60000, 4000));
  merged.printDurationMs = Math.round(clamp(merged.printDurationMs, 1200, 4000, 2000));
  merged.toastDurationMs = Math.round(clamp(merged.toastDurationMs, 3000, 12000, 5000));
  merged.diamondToastExtraMs = Math.round(
    clamp(merged.diamondToastExtraMs, 0, 6000, 2000),
  );
  merged.sound.volume = clamp(merged.sound.volume, 0, 1, 0.4);
  merged.music.volume = clamp(merged.music.volume, 0, 1, 0.15);
  merged.ticker.speed = Math.round(clamp(merged.ticker.speed, 20, 300, 55));
  merged.tickerCredits.speed = Math.round(
    clamp(merged.tickerCredits.speed, 20, 300, 55),
  );
  merged.engagement.likeThreshold = Math.round(
    clamp(merged.engagement.likeThreshold, 1, 1_000_000, 1000),
  );
  merged.debug = params.has("debug") && flagEnabled(params.get("debug"));
  merged.simulate = params.has("sim") && flagEnabled(params.get("sim"));

  return merged;
}
