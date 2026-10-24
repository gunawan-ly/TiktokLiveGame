import test from "node:test";
import assert from "node:assert/strict";
import {
  TICKER_SEPARATOR,
  Ticker,
  buildTickerText,
  tickerTravelSec,
} from "../overlay/js/ticker.js";

// Test Ticker (overlay/js/ticker.js) memakai elemen palsu, tanpa DOM.
// Menjaga: teks gabungan + pemisah, marquee klasik (satu span, titik
// awal/akhir dari lebar strip dan teks), dan kondisi diam
// (nonaktif/pesan kosong).

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
    this.offsetWidth = 1000;
  }
}

const MESSAGES = ["Pesan satu", "Pesan dua"];

test("teks gabungan memakai pemisah dan membuang pesan kosong", () => {
  assert.equal(buildTickerText(MESSAGES), `Pesan satu${TICKER_SEPARATOR}Pesan dua`);
  assert.equal(buildTickerText(["  ", "Isi", ""]), "Isi");
  assert.equal(buildTickerText([]), "");
  assert.equal(buildTickerText(null), "");
});

test("durasi perjalanan = (lebar strip + lebar teks) / kecepatan, dijaga", () => {
  assert.equal(tickerTravelSec(1000, 1200, 80), 27.5);
  assert.equal(tickerTravelSec(0, 1200, 80), 40);
  assert.equal(tickerTravelSec(1000, 0, 80), 40);
  assert.equal(tickerTravelSec(1000, 1200, 0), 40);
  assert.equal(tickerTravelSec(100, 100, 80), 5);
  assert.equal(tickerTravelSec(20000, 20000, 80), 300);
});

test("start menampilkan strip dengan satu span + titik marquee terukur", () => {
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
  assert.equal(track.children.length, 1);
  assert.equal(
    track.children[0].textContent,
    `Pesan satu${TICKER_SEPARATOR}Pesan dua`,
  );
  assert.equal(track.style.getPropertyValue("--ticker-from"), "1000px");
  assert.equal(track.style.getPropertyValue("--ticker-to"), "-1208px");
  assert.equal(track.style.getPropertyValue("--ticker-duration"), "27.5s");
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

test("dua instance ticker (info + credits) saling bebas", () => {
  const infoContainer = new FakeContainer();
  const infoTrack = new FakeTrack();
  const creditsContainer = new FakeContainer();
  const creditsTrack = new FakeTrack();
  const info = new Ticker({
    container: infoContainer,
    track: infoTrack,
    messages: ["Info live"],
    enabled: true,
    createSpan: (text) => new FakeSpan(text),
  });
  const credits = new Ticker({
    container: creditsContainer,
    track: creditsTrack,
    messages: ["Credits lagu"],
    enabled: true,
    createSpan: (text) => new FakeSpan(text),
  });
  info.start();
  credits.start();
  assert.equal(infoTrack.children[0].textContent, "Info live");
  assert.equal(creditsTrack.children[0].textContent, "Credits lagu");
  info.stop();
  assert.equal(infoContainer.hidden, true);
  assert.equal(creditsContainer.hidden, false);
});
