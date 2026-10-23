import { loadGameConfig } from "./config.js";
import { setupDebugPanel } from "./debug.js";
import { normalizeGiftMessage } from "./normalize.js";
import { PrintQueue } from "./queue.js";
import { OverlayRenderer } from "./render.js";
import { startSimulation } from "./simulate.js";
import { PrintSound } from "./sound.js";
import { normalizeTiers, tierForCoins } from "./tiers.js";
import { StudioSocket } from "./ws.js";

const elements = {
  studioTitle: document.getElementById("studioTitle"),
  studioSubtitle: document.getElementById("studioSubtitle"),
  sheetBrand: document.getElementById("sheetBrand"),
  sheetCount: document.getElementById("sheetCount"),
  printedCount: document.getElementById("printedCount"),
  targetText: document.getElementById("targetText"),
  targetBar: document.getElementById("targetBar"),
  queueStat: document.getElementById("queueStat"),
  queueCount: document.getElementById("queueCount"),
  connection: document.getElementById("connection"),
  connectionLabel: document.getElementById("connectionLabel"),
  photoGrid: document.getElementById("photoGrid"),
  roll: document.getElementById("roll"),
  rollStrip: document.getElementById("rollStrip"),
  rollCount: document.getElementById("rollCount"),
  printerHead: document.getElementById("printerHead"),
  scene: document.getElementById("scene"),
  toastStack: document.getElementById("toastStack"),
  simBadge: document.getElementById("simBadge"),
  debugPanel: document.getElementById("debugPanel"),
};

let queue;
let renderer;
let socket;
let simulation;
let pumping = false;

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
  renderer = new OverlayRenderer({ config, tiers, elements, sound });
  queue = new PrintQueue();

  const updateQueue = () => {
    renderer.setQueueLength(queue.length);
  };

  const acceptGift = (message) => {
    const item = normalizeGiftMessage(message);
    if (!item) {
      console.warn("Gift diabaikan karena payload tidak valid.");
      return false;
    }
    const result = queue.push(item);
    if (!result.ok) {
      return false;
    }
    updateQueue();
    pump();
    return true;
  };

  const pushGift = (data) => acceptGift(coercePayload(data));

  const clearQueue = () => {
    const cleared = queue.clear();
    updateQueue();
    return cleared;
  };

  async function pump() {
    if (pumping) {
      return;
    }
    const item = queue.beginNext();
    if (!item) {
      updateQueue();
      return;
    }

    pumping = true;
    updateQueue();
    try {
      const tier = tierForCoins(item.totalCoins, tiers);
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
    clearQueue,
  });

  const params = new URLSearchParams(window.location.search);
  const hasExplicitWs = params.has("ws");
  if (config.simulate && !hasExplicitWs) {
    renderer.setConnection("mock", "simulasi lokal");
  } else {
    socket = new StudioSocket(config.wsUrl, {
      onGift: acceptGift,
      onStatus: (state, detail) => renderer.setConnection(state, detail),
      onSnapshot: (snapshot) => renderer.applySnapshot(snapshot),
    });
    socket.connect();
  }

  if (config.simulate) {
    simulation = startSimulation(pushGift);
  }

  window.StudioPhoto = {
    pushGift,
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
    socket?.close();
    simulation?.stop();
  });
}

bootstrap().catch((error) => {
  console.error("Overlay gagal dimulai:", error);
});
