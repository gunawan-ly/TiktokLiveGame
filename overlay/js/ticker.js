// Running teks overlay: dua strip pesan berjalan model marquee klasik.
// Teks muncul dari kanan, berjalan ke kiri sampai hilang seluruhnya,
// lalu muncul lagi dari kanan. Strip atas untuk info arahan live
// (penting, harus selalu terlihat); strip bawah untuk credits.
//
// Info ditaruh paling atas (bukan bawah) atas permintaan pemilik: kolom
// komentar TikTok menutupi area bawah layar penonton, jadi info penting
// akan terhalang komentar kalau ditaruh di bawah. Credits di bawah boleh
// sesekali tertutup komentar karena sifatnya pelengkap dan terus
// mengulang. Strip atas juga tidak menabrak header (mulai 2.7rem) maupun
// toast (jangkar bawah).
//
// Mekanisme: satu span di dalam track. JS mengukur lebar strip (C) dan
// lebar teks (W) lalu mengatur --ticker-from (C px, teks mulai di luar
// kanan), --ticker-to (-(W + margin) px, teks hilang di kiri), dan
// --ticker-duration ((C + W) / kecepatan). Pengukuran dilakukan sesudah
// strip ditampilkan (offsetWidth elemen tersembunyi selalu 0) dan
// semuanya sinkron dalam satu tugas supaya tidak ada kedip. Modul ini
// bebas DOM saat import: elemen disuntik lewat konstruktor, pembuatan
// span bisa diganti pabrik palsu di test.

export const TICKER_SEPARATOR = "  ✦  ";
const FALLBACK_DURATION_SEC = 40;
const EDGE_MARGIN_PX = 8;

export function buildTickerText(messages, separator = TICKER_SEPARATOR) {
  const list = (Array.isArray(messages) ? messages : [])
    .map((message) => String(message || "").trim())
    .filter(Boolean);
  if (list.length === 0) {
    return "";
  }
  return list.join(separator);
}

export function tickerTravelSec(containerWidthPx, textWidthPx, speedPxPerSec) {
  const container = Number(containerWidthPx);
  const text = Number(textWidthPx);
  const speed = Number(speedPxPerSec);
  if (
    !Number.isFinite(container) ||
    !Number.isFinite(text) ||
    !Number.isFinite(speed) ||
    container <= 0 ||
    text <= 0 ||
    speed <= 0
  ) {
    return FALLBACK_DURATION_SEC;
  }
  return Math.min(300, Math.max(5, (container + text) / speed));
}

export class Ticker {
  constructor({
    container = null,
    track = null,
    messages = [],
    separator = TICKER_SEPARATOR,
    speed = 80,
    enabled = true,
    createSpan = null,
  } = {}) {
    this.container = container;
    this.track = track;
    this.messages = messages;
    this.separator = separator;
    this.speed = speed;
    this.enabled = Boolean(enabled);
    this.createSpan = createSpan;
    this.started = false;
  }

  _makeSpan(text) {
    if (this.createSpan) {
      return this.createSpan(text);
    }
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }

  start() {
    if (!this.enabled || !this.container || !this.track || this.started) {
      return;
    }
    const text = buildTickerText(this.messages, this.separator);
    if (!text) {
      return;
    }
    const span = this._makeSpan(text);
    this.track.appendChild(span);
    // Tampilkan dulu baru ukur: offsetWidth saat tersembunyi selalu 0.
    this.container.hidden = false;
    const containerWidth = Number(this.container.offsetWidth) || 0;
    const textWidth = Number(span.offsetWidth) || 0;
    const duration = tickerTravelSec(containerWidth, textWidth, this.speed);
    if (this.track.style && typeof this.track.style.setProperty === "function") {
      this.track.style.setProperty("--ticker-from", `${containerWidth}px`);
      this.track.style.setProperty("--ticker-to", `${-(textWidth + EDGE_MARGIN_PX)}px`);
      this.track.style.setProperty("--ticker-duration", `${duration}s`);
    }
    this.started = true;
  }

  stop() {
    this.started = false;
    if (this.container) {
      this.container.hidden = true;
    }
  }
}
