import { loadGameConfig } from "./config.js";
import { setupDebugPanel } from "./debug.js";
import { MusicPlayer } from "./music.js";
import { normalizeEmeraldMessage, normalizeGiftMessage, normalizeJoinMessage } from "./normalize.js";
import { PrintQueue } from "./queue.js";
import { OverlayRenderer } from "./render.js";
import { startSimulation } from "./simulate.js";
import { PrintSound } from "./sound.js";
import { Ticker } from "./ticker.js";
import { normalizeTiers, tierForCoins } from "./tiers.js";
import { StudioSocket } from "./ws.js";

const elements = {
  studioTitle: document.getElementById("studioTitle"),
  studioSubtitle: document.getElementById("studioSubtitle"),
  machine: document.getElementById("machine"),
  sheetBrand: document.getElementById("sheetBrand"),
  sheetCount: document.getElementById("sheetCount"),
  printedCount: document.getElementById("printedCount"),
  targetText: document.getElementById("targetText"),
  targetBar: document.getElementById("targetBar"),
  queueStat: document.getElementById("queueStat"),
  queueCount: document.getElementById("queueCount"),
  queueLabel: document.getElementById("queueLabel"),
  connection: document.getElementById("connection"),
  connectionLabel: document.getElementById("connectionLabel"),
  toastStack: document.getElementById("toastStack"),
  joinStack: document.getElementById("joinStack"),
  simBadge: document.getElementById("simBadge"),
  debugPanel: document.getElementById("debugPanel"),
  ticker: document.getElementById("ticker"),
  tickerTrack: document.getElementById("tickerTrack"),
  tickerCredits: document.getElementById("tickerCredits"),
  tickerCreditsTrack: document.getElementById("tickerCreditsTrack"),
  audioHint: document.getElementById("audioHint"),
};

let queue;
let renderer;
let socket;
let simulation;
let pumping = false;
let retryTimer = null;

function clampNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, number));
}

function coercePayload(data = {}) {
  const user = data.user && typeof data.user === "object" ? data.user : {};
  const gift = data.gift && typeof data.gift === "object" ? data.gift : {};
  const repeat = Math.floor(clampNumber(gift.repeat, 1, 1, 1_000_000));
  const providedTotal = gift.totalCoins ?? data.totalCoins;
  const coinsPerItem = Math.floor(
    clampNumber(
      gift.coinsPerItem,
      providedTotal == null ? 1 : Math.max(1, Math.round(Number(providedTotal) / repeat)),
      0,
      1_000_000_000,
    ),
  );
  const totalCoins = Math.floor(
    clampNumber(
      providedTotal,
      repeat * coinsPerItem,
      0,
      1_000_000_000_000,
    ),
  );

  return {
    type: "gift",
    eventId: data.eventId,
    user: {
      username: user.username || "tester",
      displayName: user.displayName || user.username || "Tester",
      avatarUrl: user.avatarUrl || "",
    },
    gift: {
      id: gift.id ?? 0,
      name: gift.name || "Mawar",
      repeat,
      coinsPerItem,
      totalCoins,
    },
    timestamp: data.timestamp || new Date().toISOString(),
  };
}

async function bootstrap() {
  const config = await loadGameConfig();
  const tiers = normalizeTiers(config.tiers);
  const sound = new PrintSound(config.sound);
  const music = new MusicPlayer({ audio: new Audio(), ...config.music });
  music.start();
  // HP mengunci audio sampai ada gestur. Unlock dicoba lagi di setiap
  // ketukan dan setiap gift masuk: sesudah ketukan pertama, aktivasi
  // lengket browser membuat percobaan berikutnya berhasil (mekanisme
  // yang sama yang membuka bunyi aksi).
  // Chip penanda muncul selama musik aktif tapi belum terdengar, supaya
  // keadaan terkunci terlihat (di OBS: klik chip lewat Interact) dan
  // hilang sendiri begitu musik benar-benar berputar.
  const refreshAudioHint = () => {
    if (elements.audioHint) {
      elements.audioHint.hidden = !(config.music.enabled && !music.isAudible());
    }
  };
  const pokeAudio = () => {
    music.unlock();
    window.setTimeout(refreshAudioHint, 350);
  };
  window.addEventListener("pointerdown", pokeAudio);
  music.audio?.addEventListener?.("play", refreshAudioHint);
  window.setTimeout(refreshAudioHint, 1200);
  const ticker = new Ticker({
    container: elements.ticker,
    track: elements.tickerTrack,
    ...config.ticker,
  });
  ticker.start();
  const tickerCredits = new Ticker({
    container: elements.tickerCredits,
    track: elements.tickerCreditsTrack,
    ...config.tickerCredits,
  });
  tickerCredits.start();
  renderer = new OverlayRenderer({ config, tiers, elements, sound });
  queue = new PrintQueue(config.maxQueueItems, config.senderGapMs);

  const updateQueue = () => {
    renderer.setQueueLength(queue.length);
  };

  const acceptGift = (message) => {
    const item = normalizeGiftMessage(message);
    if (!item) {
      console.warn("Gift diabaikan karena payload tidak valid.");
      return false;
    }
    pokeAudio();
    renderer.prefetchAvatar(item.avatarUrl);
    const result = queue.push(item);
    if (!result.ok) {
      if (result.reason === "full") {
        renderer.flashQueueFull();
        console.warn("Gift ditolak karena antrean penuh.");
      }
      return false;
    }
    updateQueue();
    pump();
    return true;
  };

  const acceptEmerald = (message) => {
    const item = normalizeEmeraldMessage(message);
    if (!item) {
      console.warn("Cetak Zamrud diabaikan karena payload tidak valid.");
      return false;
    }
    pokeAudio();
    renderer.prefetchAvatar(item.avatarUrl);
    const result = queue.push(item);
    if (!result.ok) {
      if (result.reason === "full") {
        renderer.flashQueueFull();
        console.warn("Cetak Zamrud ditolak karena antrean penuh.");
      }
      return false;
    }
    updateQueue();
    pump();
    return true;
  };

  const pushGift = (data) => acceptGift(coercePayload(data));

  // Popup orang masuk tidak lewat antrean cetak; cukup saring payload,
  // tolak duplikat eventId, lalu tampilkan sebagai notifikasi mini.
  const seenJoinIds = new Set();
  const acceptJoin = (message) => {
    if (!config.joinPopupsEnabled) {
      return false;
    }
    const item = normalizeJoinMessage(message);
    if (!item || seenJoinIds.has(item.eventId)) {
      return false;
    }
    seenJoinIds.add(item.eventId);
    renderer.showJoin(item);
    return true;
  };

  const clearQueue = () => {
    const cleared = queue.clear();
    updateQueue();
    return cleared;
  };

  const clearRetryTimer = () => {
    clearTimeout(retryTimer);
    retryTimer = null;
  };

  const scheduleRetry = () => {
    clearRetryTimer();
    const delay = queue.nextReadyIn();
    if (delay == null) {
      return;
    }
    retryTimer = window.setTimeout(pump, Math.max(20, delay + 5));
  };

  async function pump() {
    if (pumping) {
      return;
    }
    const item = queue.beginNext();
    if (!item) {
      updateQueue();
      scheduleRetry();
      return;
    }

    pumping = true;
    clearRetryTimer();
    updateQueue();
    try {
      const tier = item.tierOverride || tierForCoins(item.cumulativeCoins ?? item.totalCoins, tiers);
      await renderer.printGift(item, tier);
    } catch (error) {
      console.error("Gagal mencetak gift:", error);
    } finally {
      queue.finishPrint();
      queue.markIdle();
      pumping = false;
      updateQueue();
      if (queue.length > 0) {
        pump();
      }
    }
  }

  setupDebugPanel({
    enabled: Boolean(config.debug),
    pushGift,
    pushEmerald: acceptEmerald,
    pushJoin: acceptJoin,
    clearQueue,
  });

  const params = new URLSearchParams(window.location.search);
  const hasExplicitWs = params.has("ws");
  if (config.simulate && !hasExplicitWs) {
    renderer.setConnection("mock", "simulasi lokal");
  } else {
    socket = new StudioSocket(config.wsUrl, {
      onGift: acceptGift,
      onEmerald: acceptEmerald,
      onJoin: acceptJoin,
      onStatus: (state, detail) => renderer.setConnection(state, detail),
      onSnapshot: (snapshot) => renderer.applySnapshot(snapshot),
    });
    socket.connect();
  }

  if (config.simulate) {
    simulation = startSimulation(pushGift, acceptJoin);
  }

  window.StudioPhoto = {
    pushGift,
    pushEmerald: acceptEmerald,
    pushJoin: acceptJoin,
    clearQueue,
    getState: () => ({
      printed: renderer.printedPhotos,
      coins: renderer.sessionCoins,
      queued: queue.length,
      state: queue.state,
      wsUrl: config.wsUrl,
    }),
  };

  window.addEventListener("beforeunload", () => {
    clearRetryTimer();
    ticker.stop();
    tickerCredits.stop();
    music.stop();
    socket?.close();
    simulation?.stop();
  });
}

bootstrap().catch((error) => {
  console.error("Overlay gagal dimulai:", error);
});
