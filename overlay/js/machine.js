import { avatarHueFor, initialsFor } from "./normalize.js";
import { tierAccent, tierLabel } from "./tiers.js";

const COLS = 3;
const ROWS = 3;
const COL_X = [16.6667, 50, 83.3333];

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const PHASES = {
  move: 0.26,
  press: 0.1,
  draw: 0.44,
  lift: 0.2,
  liftFeed: 0.08,
  feed: 0.23,
};

const SPARKLE_COUNT = { standard: 0, bronze: 0, silver: 2, gold: 4, diamond: 6 };

export class PrintMachine {
  constructor({ root, config, tiers, avatarKnownBad = null }) {
    this.root = root;
    this.config = config;
    this.tiers = tiers;
    this.avatarKnownBad = avatarKnownBad || (() => false);
    this.top = root.querySelector("#machineTop");
    this.sheet = root.querySelector("#paperSheet");
    this.feedShade = root.querySelector("#feedShade");
    this.carriage = root.querySelector("#carriage");
    this.printHead = root.querySelector("#printHead");
    this.headArm = root.querySelector("#headArm");
    this.roller = root.querySelector("#frontRoller");
    this.rollStrip = root.querySelector("#rollStrip");
    this.rollCount = root.querySelector("#rollCount");
    this.rows = [];
    this.minis = [];
    this.col = 0;
    this.fedPhotos = 0;

    this._buildSheet();
    this._syncSlots();
  }

  _buildSheet() {
    this.sheet.replaceChildren();
    for (let index = 0; index < ROWS; index += 1) {
      const row = document.createElement("div");
      row.className = "sheet-row";
      row.style.setProperty("--slot", String(index));
      for (let cellIndex = 0; cellIndex < COLS; cellIndex += 1) {
        const cell = document.createElement("div");
        cell.className = "print-cell tier-standard";
        cell.dataset.printed = "0";
        row.append(cell);
      }
      this.sheet.append(row);
      this.rows.push(row);
    }
  }

  _syncSlots() {
    this.rows.forEach((row, index) => {
      row.style.setProperty("--slot", String(index));
    });
  }

  _slideRows(durationMs, rows) {
    rows.forEach((row) => {
      row.style.transitionDuration = `${durationMs}ms`;
    });
  }

  slideHead(durationMs) {
    if (this.carriage) {
      this.carriage.style.transitionDuration = `${durationMs}ms`;
    }
    if (this.printHead) {
      this.printHead.style.transitionDuration = `${durationMs}ms`;
    }
    if (this.headArm) {
      this.headArm.style.transitionDuration = `${durationMs}ms`;
    }
  }

  async print(item, tier) {
    const total = Math.max(
      1200,
      Math.min(4000, Number(this.config.printDurationMs) || 2000),
    );
    const moveMs = Math.round(total * PHASES.move);
    const pressMs = Math.round(total * PHASES.press);
    const drawMs = Math.round(total * PHASES.draw);
    const liftMs = Math.round(total * PHASES.lift);
    const liftFeedMs = Math.round(total * PHASES.liftFeed);
    const feedMs = Math.round(total * PHASES.feed);

    const col = this.col;
    const row = this.rows[0];
    const cell = row.children[col];

    this._prepareCell(cell, item, tier);
    this.top.style.setProperty("--draw", "0");
    this.top.style.setProperty("--head-col", String(COL_X[col]));
    this.slideHead(moveMs);
    await sleep(moveMs + pressMs);

    this.top.classList.add("is-pressing");
    this.top.classList.add("is-drawing");
    await new Promise((resolve) => {
      const start = window.performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / drawMs);
        const value = easeInOut(t);
        this.top.style.setProperty("--draw", value.toFixed(4));
        this._revealTyped(cell, value);
        if (t < 1) {
          window.requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      window.requestAnimationFrame(tick);
    });

    this.top.style.setProperty("--draw", "1");
    cell.classList.add("is-done");
    this.top.classList.remove("is-drawing");
    this.col = (col + 1) % COLS;

    if (col === COLS - 1) {
      this.top.classList.remove("is-pressing");
      this.top.classList.remove("is-drawing");
      this.top.style.setProperty("--draw", "0");
      await sleep(Math.max(480, liftMs));
      this.top.style.setProperty("--head-col", String(COL_X[0]));
      this.slideHead(Math.max(500, feedMs));
      await this.feed(Math.max(500, feedMs));
      return;
    }

    this.top.classList.remove("is-pressing");
    this.top.style.setProperty("--draw", "0");
    await sleep(liftMs);
    cell.classList.remove("is-printing");
  }

  async feed(feedMs) {
    const exiting = this.rows.pop();
    this._snapshotToDrum(exiting);

    this.rows.unshift(exiting);
    this._slideRows(feedMs, this.rows.concat(exiting));
    exiting.style.setProperty("--slot", "3");
    this.rows[0].style.setProperty("--slot", "1");
    this.rows[1].style.setProperty("--slot", "2");

    this.top.classList.add("is-feeding");
    this.roller.classList.add("is-feeding");

    await sleep(feedMs + 60);

    exiting.classList.add("no-anim");
    exiting.style.setProperty("--slot", "0");
    void exiting.offsetWidth;
    exiting.classList.remove("no-anim");
    exiting.querySelectorAll(".print-cell").forEach((cell) => {
      cell.className = "print-cell tier-standard";
      cell.dataset.printed = "0";
      cell.replaceChildren();
    });

    this.top.classList.remove("is-feeding");
    this.roller.classList.remove("is-feeding");
  }

  _snapshotToDrum(exiting) {
    for (const cell of exiting.children) {
      if (cell.dataset.printed !== "1") {
        continue;
      }
      this._pushMini(cell);
    }
    if (this.rollCount) {
      this.rollCount.textContent = `${this.minis.length}/${this.config.maxRollPhotos}`;
    }
  }

  _pushMini(cell) {
    const tier = this._cellTier(cell);
    const name = this._cellName(cell) || "SP";
    if (this.minis.length >= this.config.maxRollPhotos) {
      const oldest = this.minis.shift();
      oldest.remove();
    }
    const mini = document.createElement("div");
    mini.className = `roll-mini tier-${tier}`;
    const avatar = document.createElement("div");
    avatar.className = "roll-mini-avatar";
    const fallback = document.createElement("div");
    fallback.className = "avatar-fallback";
    fallback.style.setProperty("--avatar-hue", avatarHueFor(name));
    fallback.textContent = initialsFor(name);
    avatar.append(fallback);
    const imageSrc = this._cellAvatar(cell);
    if (imageSrc && !this.avatarKnownBad(imageSrc)) {
      const image = document.createElement("img");
      image.className = "avatar-img";
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.decoding = "async";
      image.addEventListener("error", () => image.remove(), { once: true });
      image.src = imageSrc;
      avatar.append(image);
    }
    const dot = document.createElement("span");
    dot.className = "roll-mini-dot";
    dot.style.setProperty("--mini-accent", tierAccent(tier));
    mini.append(avatar, dot);
    this.rollStrip.append(mini);
    this.minis.push(mini);
    this.fedPhotos += 1;
  }

  _cellName(cell) {
    return cell.querySelector(".card-name")?.textContent ?? "";
  }

  _cellAvatar(cell) {
    return cell.querySelector(".avatar-img")?.getAttribute("src") ?? "";
  }

  _cellTier(cell) {
    const match = /tier-([a-z]+)/.exec(cell.className);
    return match ? match[1] : "standard";
  }

  _prepareCell(cell, item, tier) {
    cell.replaceChildren();
    cell.className = `print-cell tier-${tier} is-busy is-printing`;
    cell.dataset.printed = "1";
    cell.append(this._buildFrame(tier));
    cell.append(this._buildPhoto(item));
    cell.append(this._buildName(item.displayName));
    if (tier !== "standard") {
      cell.append(this._buildPill(tier));
    }
    const sparkles = this._buildSparkles(tier);
    if (sparkles) {
      cell.append(sparkles);
    }
  }

  _buildFrame(tier) {
    const frame = document.createElement("span");
    frame.className = "cell-frame";
    const glow = document.createElement("span");
    glow.className = "frame-glow";
    const wrap = document.createElement("span");
    wrap.className = `frame-wrap${tier === "diamond" ? " ring-spin" : ""}`;
    const annulus = document.createElement("span");
    annulus.className = "frame-annulus";
    const metal = document.createElement("span");
    metal.className = "frame-metal";
    const shine = document.createElement("span");
    shine.className = "frame-shine";
    annulus.append(metal, shine);
    wrap.append(annulus);
    frame.append(glow, wrap);
    return frame;
  }

  _buildPhoto(item) {
    const reveal = document.createElement("div");
    reveal.className = "photo-reveal";
    const mat = document.createElement("div");
    mat.className = "photo-mat";
    const photo = document.createElement("div");
    photo.className = "photo-circle";
    const fallback = document.createElement("div");
    fallback.className = "avatar-fallback";
    fallback.style.setProperty("--avatar-hue", avatarHueFor(item.displayName));
    fallback.textContent = initialsFor(item.displayName);
    photo.append(fallback);
    if (item.avatarUrl && !this.avatarKnownBad(item.avatarUrl)) {
      const image = document.createElement("img");
      image.className = "avatar-img";
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.decoding = "async";
      image.addEventListener("error", () => image.remove(), { once: true });
      image.src = item.avatarUrl;
      photo.append(image);
    }
    const glare = document.createElement("span");
    glare.className = "photo-glare";
    photo.append(glare);
    mat.append(photo);
    reveal.append(mat);
    return reveal;
  }

  _buildName(name) {
    const label = document.createElement("span");
    label.className = "card-name";
    const text = String(name || "").slice(0, 24);
    for (const character of text) {
      const span = document.createElement("span");
      span.textContent = character === " " ? "\u00A0" : character;
      label.append(span);
    }
    return label;
  }

  _buildPill(tier) {
    const pill = document.createElement("span");
    pill.className = "tier-pill";
    pill.textContent = tierLabel(tier, this.tiers);
    return pill;
  }

  _buildSparkles(tier) {
    const count = SPARKLE_COUNT[tier] || 0;
    if (!count) {
      return null;
    }
    const box = document.createElement("span");
    box.className = "card-sparkles";
    for (let index = 0; index < count; index += 1) {
      const sparkle = document.createElement("i");
      sparkle.className = "sparkle";
      const angle = (Math.PI * 2 * index) / count;
      sparkle.style.left = `${50 + 44 * Math.cos(angle)}%`;
      sparkle.style.top = `${45 + 38 * Math.sin(angle)}%`;
      sparkle.style.setProperty("--sparkle-delay", `${index * 130}ms`);
      sparkle.style.setProperty("--sparkle-size", index % 2 ? "0.4rem" : "0.56rem");
      box.append(sparkle);
    }
    return box;
  }

  _revealTyped(cell, value) {
    const spans = cell.querySelectorAll(".card-name span");
    const shown = Math.floor(value * spans.length + 0.0001);
    spans.forEach((span, index) => {
      span.classList.toggle("is-shown", index < shown);
    });
  }
}
