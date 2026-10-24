import { avatarHueFor, initialsFor } from "./normalize.js";
import { tierAccent, tierLabel } from "./tiers.js";
import { PrintMachine } from "./machine.js";

const CONNECTION_LABELS = {
  connecting: "MENYAMBUNG",
  connected: "LIVE",
  disconnected: "TERPUTUS",
  waiting: "MENUNGGU LIVE",
  mock: "SIMULASI",
};

export class OverlayRenderer {
  constructor({ config, tiers, elements, sound }) {
    this.config = config;
    this.tiers = tiers;
    this.el = elements;
    this.sound = sound;
    this.printedPhotos = 0;
    this.sessionCoins = 0;
    this.queueLength = 0;
    this.snapshotApplied = false;
    this.toastTimers = new Map();
    this._avatarPrefetch = new Map();
    this._avatarPrefetchLimit = 500;
    this._queueFullTimer = null;

    this.machine = new PrintMachine({
      root: this.el.machine,
      config,
      tiers,
      avatarKnownBad: (url) => this._avatarKnownBad(url),
      onEvent: (type, detail) => this._onMachineEvent(type, detail),
    });

    this.setTitle(config.title, config.subtitle);
    this.setSimulationBadge(Boolean(config.simulate));
    this.updateHud();
  }

  setTitle(title, subtitle) {
    const safeTitle = String(title || "STUDIO PHOTO").trim().slice(0, 32) || "STUDIO PHOTO";
    const safeSubtitle =
      String(subtitle || "LIVE PHOTO BOOTH").trim().slice(0, 40) || "LIVE PHOTO BOOTH";
    this.el.studioTitle.textContent = safeTitle;
    this.el.sheetBrand.textContent = safeTitle;
    this.el.studioSubtitle.textContent = safeSubtitle;
    document.title = `${safeTitle} | Studio Photo Live`;
  }

  setConnection(state, detail = "") {
    const normalized = CONNECTION_LABELS[state] ? state : "disconnected";
    this.el.connection.dataset.state = normalized;
    this.el.connectionLabel.textContent = CONNECTION_LABELS[normalized];
    this.el.connection.title = detail || CONNECTION_LABELS[normalized];
  }

  setSimulationBadge(visible) {
    this.el.simBadge.hidden = !visible;
  }

  applySnapshot(snapshot) {
    if (this.snapshotApplied) {
      return;
    }
    this.snapshotApplied = true;
    const stats = snapshot?.stats || {};
    const printed = Number(stats.printed);
    const coins = Number(stats.totalCoins);
    if (this.printedPhotos === 0 && Number.isFinite(printed) && printed > 0) {
      this.printedPhotos = Math.floor(printed);
    }
    if (this.sessionCoins === 0 && Number.isFinite(coins) && coins > 0) {
      this.sessionCoins = Math.floor(coins);
    }
    if (snapshot?.connection) {
      this.setConnection(snapshot.connection, snapshot.detail || "");
    }
    this.updateHud();
  }

  setQueueLength(length) {
    this.queueLength = Math.max(0, Number(length) || 0);
    this.updateHud();
  }

  prefetchAvatar(url) {
    const source = String(url || "");
    if (!source || this._avatarPrefetch.has(source)) {
      return;
    }
    if (this._avatarPrefetch.size >= this._avatarPrefetchLimit) {
      const oldest = this._avatarPrefetch.keys().next().value;
      this._avatarPrefetch.delete(oldest);
    }
    this._avatarPrefetch.set(source, "loading");
    const probe = new Image();
    probe.referrerPolicy = "no-referrer";
    probe.decoding = "async";
    probe.onload = () => {
      if (this._avatarPrefetch.get(source) === "loading") {
        this._avatarPrefetch.set(source, "ok");
      }
    };
    probe.onerror = () => {
      this._avatarPrefetch.set(source, "bad");
    };
    probe.src = source;
  }

  _avatarKnownBad(url) {
    return this._avatarPrefetch.get(url) === "bad";
  }

  flashQueueFull() {
    const stat = this.el.queueStat;
    stat.dataset.full = "true";
    this.el.queueLabel.textContent = "ANTREAN PENUH";
    clearTimeout(this._queueFullTimer);
    this._queueFullTimer = window.setTimeout(() => {
      this._queueFullTimer = null;
      if (stat.dataset.full === "true") {
        this.el.queueLabel.textContent = "ANTREAN";
        delete stat.dataset.full;
      }
    }, 3000);
  }

  updateHud() {
    this.el.printedCount.textContent = this.printedPhotos.toLocaleString("id-ID");
    this.el.sheetCount.textContent = this.printedPhotos.toLocaleString("id-ID");
    this.el.targetText.textContent = `${this.sessionCoins.toLocaleString("id-ID")}/${this.config.targetCoins.toLocaleString("id-ID")}`;
    const progress = Math.min(1, this.sessionCoins / this.config.targetCoins);
    this.el.targetBar.style.width = `${(progress * 100).toFixed(2)}%`;
    this.el.queueStat.hidden = this.queueLength <= 0;
    this.el.queueCount.textContent = String(this.queueLength);
  }

  _onMachineEvent(type, detail = {}) {
    if (!this.sound) {
      return;
    }
    if (type === "print-start") {
      this.sound.playPrint(detail.durationMs);
    } else if (type === "feed") {
      this.sound.playFeed();
    } else if (type === "roll") {
      this.sound.playRoll();
    }
  }

  async printGift(item, tier) {
    await this.machine.print(item, tier);
    if (this.sound) {
      this.sound.playComplete(tier);
    }
    this.printedPhotos += 1;
    this.sessionCoins += item.totalCoins;
    this.updateHud();
    this._showToast(item, tier);
  }

  _showToast(item, tier) {
    while (this.el.toastStack.children.length >= 3) {
      this._dismissToast(this.el.toastStack.firstElementChild);
      this.el.toastStack.firstElementChild?.remove();
    }

    const toast = document.createElement("div");
    toast.className = `toast tier-${tier}`;
    toast.style.setProperty("--toast-accent", tierAccent(tier));

    const avatar = document.createElement("div");
    avatar.className = "toast-avatar";
    const fallback = document.createElement("div");
    fallback.className = "avatar-fallback";
    fallback.style.setProperty("--avatar-hue", avatarHueFor(item.displayName));
    fallback.textContent = initialsFor(item.displayName);
    avatar.append(fallback);
    if (item.avatarUrl && !this._avatarKnownBad(item.avatarUrl)) {
      const image = document.createElement("img");
      image.className = "avatar-img";
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.decoding = "async";
      image.addEventListener("error", () => image.remove(), { once: true });
      image.src = item.avatarUrl;
      avatar.append(image);
    }

    const copy = document.createElement("div");
    copy.className = "toast-copy";
    const name = document.createElement("span");
    name.className = "toast-name";
    name.textContent = item.displayName;
    const gift = document.createElement("span");
    gift.className = "toast-gift";
    gift.textContent = item.likeTotal
      ? `${item.giftName} ${Number(item.likeTotal).toLocaleString("id-ID")} like`
      : `${item.giftName} x ${item.repeat}`;
    copy.append(name, gift);

    if (tier !== "standard") {
      const tierTag = document.createElement("span");
      tierTag.className = "toast-tier";
      tierTag.textContent = tierLabel(tier, this.tiers);
      copy.append(tierTag);
    }

    toast.append(avatar, copy);
    this.el.toastStack.append(toast);

    const duration =
      this.config.toastDurationMs +
      (tier === "diamond" ? this.config.diamondToastExtraMs : 0);
    const timer = window.setTimeout(() => this._dismissToast(toast), duration);
    this.toastTimers.set(toast, timer);
  }

  _dismissToast(toast) {
    if (!toast || !toast.isConnected) {
      return;
    }
    const timer = this.toastTimers.get(toast);
    if (timer) {
      window.clearTimeout(timer);
      this.toastTimers.delete(toast);
    }
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 290);
  }
}
