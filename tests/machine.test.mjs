import test from "node:test";
import assert from "node:assert/strict";

// Test regresi untuk PrintMachine (overlay/js/machine.js) memakai stub DOM
// minimal, tanpa dependensi tambahan. Menjaga dua invariant feed():
// 1. Sesudah setiap print, ketiga baris kertas selalu menempati slot 0/1/2
//    yang unik (bug lama: mulai umpan kedua ada slot ganda dan slot kosong).
// 2. Baris penuh yang keluar dari area tampil ter-snapshot ke gulungan
//    (bug lama: snapshot selalu kena baris kosong, mini tidak pernah bertambah).

class FakeStyle {
  constructor() {
    this.props = new Map();
  }
  setProperty(key, value) {
    this.props.set(key, String(value));
  }
  getPropertyValue(key) {
    return this.props.get(key) ?? "";
  }
}

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parent = null;
    this.id = "";
    this.dataset = {};
    this.style = new FakeStyle();
    this._classes = new Set();
    this._text = "";
    const el = this;
    this.classList = {
      add: (...names) => names.forEach((name) => el._classes.add(name)),
      remove: (...names) => names.forEach((name) => el._classes.delete(name)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (el._classes.has(name)) el._classes.delete(name);
          else el._classes.add(name);
        } else if (force) el._classes.add(name);
        else el._classes.delete(name);
      },
      contains: (name) => el._classes.has(name),
    };
  }
  get className() {
    return [...this._classes].join(" ");
  }
  set className(value) {
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  get textContent() {
    if (this.children.length) {
      return this.children.map((child) => child.textContent).join("");
    }
    return this._text;
  }
  set textContent(value) {
    this.children = [];
    this._text = String(value);
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener() {}
  getAttribute() {
    return null;
  }
  get offsetWidth() {
    return 100;
  }
  remove() {
    if (this.parent) {
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
      this.parent = null;
    }
  }
  _descendants(out = []) {
    for (const child of this.children) {
      out.push(child);
      child._descendants(out);
    }
    return out;
  }
  _matchesSimple(selector) {
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    if (selector.startsWith(".")) {
      return selector
        .slice(1)
        .split(".")
        .every((name) => this._classes.has(name));
    }
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) {
    let current = [this];
    for (const part of selector.trim().split(/\s+/)) {
      const next = [];
      for (const base of current) {
        for (const node of base._descendants()) {
          if (node._matchesSimple(part)) next.push(node);
        }
      }
      current = next;
    }
    return current;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

const realSetTimeout = setTimeout;

globalThis.document = {
  createElement: (tag) => new FakeElement(tag),
};
globalThis.window = {
  // Timer dipercepat 25x supaya test tidak menunggu durasi animasi asli.
  // Fase draw digerakkan performance.now() asli, jadi tetap berjalan penuh.
  setTimeout: (fn, ms, ...args) =>
    realSetTimeout(fn, Math.max(0, (ms ?? 0) / 25), ...args),
  clearTimeout,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (callback) =>
    realSetTimeout(() => callback(Date.now()), 1),
};

const { PrintMachine } = await import("../overlay/js/machine.js");

function buildMachine() {
  const root = new FakeElement("div");
  const make = (id, parent = root) => {
    const el = new FakeElement("div");
    el.id = id;
    parent.append(el);
    return el;
  };
  const top = make("machineTop");
  make("feedShade", top);
  make("carriage", top);
  make("printHead", top);
  make("headArm", top);
  make("paperSheet");
  make("frontRoller");
  make("rollStrip");
  make("rollCount");
  return new PrintMachine({
    root,
    config: { printDurationMs: 1200, maxRollPhotos: 7 },
    tiers: {},
    avatarKnownBad: () => false,
  });
}

test("feed keeps row slots unique and rotates printed rows to the drum", async () => {
  const machine = buildMachine();
  const sortedSlots = () =>
    [...machine.sheet.children]
      .map((row) => row.style.getPropertyValue("--slot"))
      .sort();
  const printedOnSheet = () =>
    [...machine.sheet.children].reduce(
      (total, row) =>
        total +
        [...row.children].filter((cell) => cell.dataset.printed === "1").length,
      0,
    );

  for (let index = 1; index <= 9; index += 1) {
    await machine.print(
      { displayName: `User${index}`, avatarUrl: "" },
      "standard",
    );
    assert.deepEqual(
      sortedSlots(),
      ["0", "1", "2"],
      `slot baris harus unik sesudah print ${index}`,
    );
  }

  // Sesudah 9 foto (3 lembar penuh): 2 lembar terbaru tampil di kertas,
  // lembar pertama sudah pindah ke gulungan sebagai 3 mini.
  assert.equal(printedOnSheet(), 6);
  assert.equal(machine.minis.length, 3);
  assert.equal(machine.fedPhotos, 3);
});

test("emerald prints carry their like-level class, gifts do not", async () => {
  const machine = buildMachine();
  const printedCells = () =>
    [...machine.sheet.children].flatMap((row) =>
      [...row.children].filter((cell) => cell.dataset.printed === "1"),
    );

  await machine.print(
    { displayName: "Pengetuk", avatarUrl: "", likeLevel: 3 },
    "emerald",
  );
  assert.match(printedCells()[0].className, /tier-emerald/);
  assert.match(printedCells()[0].className, /lv-3/);

  await machine.print(
    { displayName: "PengetukAwal", avatarUrl: "", likeLevel: 1 },
    "emerald",
  );
  assert.doesNotMatch(printedCells()[1].className, /lv-/);

  await machine.print(
    { displayName: "Penggift", avatarUrl: "", likeLevel: 4 },
    "gold",
  );
  assert.doesNotMatch(printedCells()[2].className, /lv-/);
});

test("print pills show session totals, long text shrinks", async () => {
  const machine = buildMachine();
  const printedCells = () =>
    [...machine.sheet.children].flatMap((row) =>
      [...row.children].filter((cell) => cell.dataset.printed === "1"),
    );
  const pillOf = (cell) => cell.querySelector(".tier-pill");

  await machine.print(
    { displayName: "Mawar", avatarUrl: "", totalCoins: 3 },
    "standard",
  );
  assert.equal(pillOf(printedCells()[0]).textContent, "3 koin");

  await machine.print(
    { displayName: "Sultan", avatarUrl: "", totalCoins: 29999 },
    "diamond",
  );
  assert.equal(pillOf(printedCells()[1]).textContent, "29,9 rb koin");

  await machine.print(
    { displayName: "Pengetuk", avatarUrl: "", likeTotal: 10500 },
    "emerald",
  );
  const emeraldPill = pillOf(printedCells()[2]);
  assert.equal(emeraldPill.textContent, "10,5 rb like");
  assert.match(emeraldPill.className, /is-long/);
});
