import {
  avatarHueFor,
  initialsFor,
} from "./normalize.js";
import { tierAccent, tierLabel } from "./tiers.js";

const sleep = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const GALLERY_ITEMS = [
  {
    displayName: "Ayunia ",
    totalCoins: 1,
    tier: "standard",
    avatarUrl: "../assets/avatars/avatar-1.svg",
  },
  {
    displayName: "Perunggu",
    totalCoins: 50,
    tier: "bronze",
    avatarUrl: "../assets/avatars/avatar-2.svg",
  },
  {
    displayName: "Perak",
    totalCoins: 250,
    tier: "silver",
    avatarUrl: "../assets/avatars/avatar-3.svg",
  },
  {
    displayName: "Emas",
    totalCoins: 1000,
    tier: "gold",
    avatarUrl: "../assets/avatars/avatar-4.svg",
  },
  {
    displayName: "Berlian",
    totalCoins: 29999,
    tier: "diamond",
    avatarUrl: "../assets/avatars/avatar-5.svg",
  },
  {
    displayName: "Ayunia ",
    totalCoins: 1,
    tier: "standard",
    avatarUrl: "../assets/avatars/avatar-6.svg",
  },
];

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
    this.slots = [];
    this.active = [];
    this.rolled = [];
    this.printedPhotos = 0;
    this.sessionCoins = 0;
    this.queueLength = 0;
    this.snapshotApplied = false;
    this.toastTimers = new Map();

    this._buildGrid();
    this._buildRoll();
    this.setTitle(config.title, config.subtitle);
    this.setSimulationBadge(Boolean(config.simulate));
    this.updateHud();
  }

  _buildGrid() {
    const total = Math.max(1, Math.min(9, Number(this.config.maxActivePhotos) || 9));
    this.el.photoGrid.replaceChildren();
    for (let index = 0; index < total; index += 1) {
      const slot = document.createElement("div");
      slot.className = "photo-slot";
      slot.dataset.slot = String(index);
      this.el.photoGrid.append(slot);
      this.slots.push(slot);
    }
  }

  _buildRoll() {
    this.el.rollStrip.replaceChildren();
    const empty = document.createElement("span");
    empty.className = "roll-empty";
    empty.textContent = "Belum ada foto di gulungan";
    this.el.rollStrip.append(empty);
    this.el.rollCount.textContent = `0/${this.config.maxRollPhotos}`;
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

  updateHud() {
    this.el.printedCount.textContent = this.printedPhotos.toLocaleString("id-ID");
    this.el.sheetCount.textContent = this.printedPhotos.toLocaleString("id-ID");
    this.el.targetText.textContent = `${this.sessionCoins.toLocaleString("id-ID")}/${this.config.targetCoins.toLocaleString("id-ID")}`;
    const progress = Math.min(1, this.sessionCoins / this.config.targetCoins);
    this.el.targetBar.style.width = `${(progress * 100).toFixed(2)}%`;
    this.el.queueStat.hidden = this.queueLength <= 0;
    this.el.queueCount.textContent = String(this.queueLength);
  }

  async printGift(item, tier) {
    while (this.active.length >= this.slots.length) {
      await this._rollOldest();
    }

    const slot = this.slots.find((candidate) => !candidate.classList.contains("is-filled"));
    if (!slot) {
      throw new Error("Tidak ada slot foto yang kosong");
    }

    const card = this._buildCard(item, tier);
    slot.classList.add("is-filled");
    slot.append(card);
    this.active.push({ card, item, tier, slot });

    this._startPrinter();
    if (this.sound) {
      this.sound.play(tier);
    }
    card.classList.add("is-printing");
    await sleep(this.config.printDurationMs);
    card.classList.remove("is-printing");
    card.classList.add("is-complete");
    this._stopPrinter();

    this.printedPhotos += 1;
    this.sessionCoins += item.totalCoins;
    this.updateHud();
    this._showToast(item, tier);
  }

  _buildCard(item, tier) {
    const card = document.createElement("article");
    card.className = `photo-card tier-${tier}`;
    card.style.setProperty("--print-duration", `${this.config.printDurationMs}ms`);

    const excerpt = document.createElement("div");
    excerpt.className = "card-print";

    const photo = document.createElement("div");
    photo.className = "card-photo";

    const fallback = document.createElement("div");
    fallback.className = "avatar-fallback";
    fallback.style.setProperty("--avatar-hue", avatarHueFor(item.displayName));
    fallback.textContent = initialsFor(item.displayName);
    photo.append(fallback);

    if (item.avatarUrl) {
      const image = document.createElement("img");
      image.className = "avatar-img";
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.decoding = "async";
      image.addEventListener("error", () => image.remove(), { once: true });
      image.src = item.avatarUrl;
      photo.append(image);
    }

    excerpt.append(photo);

    const shine = document.createElement("span");
    shine.className = "card-shine";
    shine.setAttribute("aria-hidden", "true");
    excerpt.append(shine);

    const sparkles = document.createElement("span");
    sparkles.className = "card-sparkles";
    sparkles.setAttribute("aria-hidden", "true");
    const sparkleCount = tier === "diamond" ? 6 : tier === "gold" ? 4 : tier === "silver" ? 2 : 0;
    for (let index = 0; index < sparkleCount; index += 1) {
      const sparkle = document.createElement("i");
      sparkle.className = "sparkle";
      sparkle.style.left = `${10 + ((index * 31) % 78)}%`;
      sparkle.style.top = `${10 + ((index * 27) % 70)}%`;
      sparkle.style.setProperty("--sparkle-delay", `${index * 90}ms`);
      sparkle.style.setProperty("--sparkle-size", index % 2 ? "0.36rem" : "0.5rem");
      sparkles.append(sparkle);
    }
    excerpt.append(sparkles);

    const username = document.createElement("span");
    username.className = "card-name";
    username.textContent = item.displayName;
    excerpt.append(username);

    if (tier !== "standard") {
      const tierPill = document.createElement("span");
      tierPill.className = "card-tier";
      const gem = tier === "diamond" ? document.createElement("span") : null;
      if (gem) {
        gem.className = "card-tier-gem";
        gem.setAttribute("aria-hidden", "true");
        tierPill.append(gem);
      }
      tierPill.append(document.createTextNode(tierLabel(tier, this.tiers)));
      excerpt.append(tierPill);
    }

    card.append(excerpt);
    return card;
  }

  _startPrinter() {
    const head = this.el.printerHead;
    this.el.scene.style.setProperty("--print-duration", `${this.config.printDurationMs}ms`);
    this.el.scene.classList.add("is-printing");
    head.classList.remove("is-active");
    void head.offsetWidth;
    head.classList.add("is-active");
  }

  _stopPrinter() {
    this.el.scene.classList.remove("is-printing");
    this.el.printerHead.classList.remove("is-active");
  }

  async _rollOldest() {
    const oldest = this.active.shift();
    if (!oldest) {
      return;
    }
    oldest.card.classList.add("is-rolling");
    await sleep(320);
    oldest.card.remove();
    oldest.slot.classList.remove("is-filled");
    this._addToRoll(oldest);
  }

  _addToRoll(entry) {
    const mini = document.createElement("div");
    mini.className = `roll-mini tier-${entry.tier}`;

    const avatar = document.createElement("div");
    avatar.className = "roll-mini-avatar";
    const fallback = document.createElement("div");
    fallback.className = "avatar-fallback";
    fallback.style.setProperty("--avatar-hue", avatarHueFor(entry.item.displayName));
    fallback.textContent = initialsFor(entry.item.displayName);
    avatar.append(fallback);
    if (entry.item.avatarUrl) {
      const image = document.createElement("img");
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.decoding = "async";
      image.addEventListener("error", () => image.remove(), { once: true });
      image.src = entry.item.avatarUrl;
      avatar.append(image);
    }

    const name = document.createElement("span");
    name.className = "roll-mini-name";
    name.textContent = entry.item.displayName;

    const dot = document.createElement("span");
    dot.className = "roll-mini-dot";
    dot.style.setProperty("--mini-accent", tierAccent(entry.tier));

    mini.append(avatar, name, dot);
    this.el.rollStrip.querySelector(".roll-empty")?.remove();
    this.el.rollStrip.append(mini);
    this.rolled.push(mini);
    while (this.rolled.length > this.config.maxRollPhotos) {
      this.rolled.shift()?.remove();
    }
    this.el.rollCount.textContent = `${this.rolled.length}/${this.config.maxRollPhotos}`;
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
    if (item.avatarUrl) {
      const image = document.createElement("img");
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
    gift.textContent = `${item.giftName} x ${item.repeat}`;
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
