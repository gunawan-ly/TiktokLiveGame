import test from "node:test";
import assert from "node:assert/strict";
import {
  TICKER_SEPARATOR,
  Ticker,
  buildTickerText,
  loopDurationSec,
} from "../overlay/js/ticker.js";

// Test Ticker (overlay/js/ticker.js) memakai elemen palsu, tanpa DOM.
// Menjaga: teks gabungan + pemisah, durasi dari lebar/kecepatan, loop
// dua span identik, dan kondisi diam (nonaktif/pesan kosong).

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

class FakeSpan {
  constructor(text) {
    this.textContent = text;
    this.offsetWidth = 1200;
  }
}

class FakeTrack {
  constructor() {
    this.children = [];
    this.style = new FakeStyle();
  }
  appendChild(child) {
    this.children.push(child);
  }
}

class FakeContainer {
  constructor() {
    this.hidden = true;
  }
}

const MESSAGES = ["Pesan satu", "Pesan dua"];

test("teks gabungan memakai pemisah dan membuang pesan kosong", () => {
  assert.equal(buildTickerText(MESSAGES), `Pesan satu${TICKER_SEPARATOR}Pesan dua`);
  assert.equal(buildTickerText(["  ", "Isi", ""]), "Isi");
  assert.equal(buildTickerText([]), "");
  assert.equal(buildTickerText(null), "");
});

test("durasi loop = lebar dibagi kecepatan, dijaga dalam batas", () => {
  assert.equal(loopDurationSec(1200, 80), 15);
  assert.equal(loopDurationSec(0, 80), 40);
  assert.equal(loopDurationSec(1200, 0), 40);
  assert.equal(loopDurationSec(100, 80), 10);
  assert.equal(loopDurationSec(20000, 80), 180);
});

test("start menampilkan strip dengan dua span identik + durasi terukur", () => {
  const container = new FakeContainer();
  const track = new FakeTrack();
  const ticker = new Ticker({
    container,
    track,
    messages: MESSAGES,
    speed: 80,
    enabled: true,
    createSpan: (text) => new FakeSpan(text),
  });
  ticker.start();
  assert.equal(container.hidden, false);
  assert.equal(track.children.length, 2);
  assert.equal(track.children[0].textContent, track.children[1].textContent);
  assert.equal(
    track.children[0].textContent,
    `Pesan satu${TICKER_SEPARATOR}Pesan dua${TICKER_SEPARATOR}`,
  );
  assert.equal(track.style.getPropertyValue("--ticker-duration"), "15s");
});

test("nonaktif atau pesan kosong membuat strip tetap tersembunyi", () => {
  const offContainer = new FakeContainer();
  const offTrack = new FakeTrack();
  new Ticker({
    container: offContainer,
    track: offTrack,
    messages: MESSAGES,
    enabled: false,
    createSpan: (text) => new FakeSpan(text),
  }).start();
  assert.equal(offContainer.hidden, true);
  assert.equal(offTrack.children.length, 0);

  const emptyContainer = new FakeContainer();
  const emptyTrack = new FakeTrack();
  new Ticker({
    container: emptyContainer,
    track: emptyTrack,
    messages: [],
    enabled: true,
    createSpan: (text) => new FakeSpan(text),
  }).start();
  assert.equal(emptyContainer.hidden, true);
  assert.equal(emptyTrack.children.length, 0);
});

test("stop menyembunyikan strip lagi", () => {
  const container = new FakeContainer();
  const track = new FakeTrack();
  const ticker = new Ticker({
    container,
    track,
    messages: MESSAGES,
    enabled: true,
    createSpan: (text) => new FakeSpan(text),
  });
  ticker.start();
  assert.equal(container.hidden, false);
  ticker.stop();
  assert.equal(container.hidden, true);
});
