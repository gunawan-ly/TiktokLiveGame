// Running teks di tepi atas overlay: strip pesan berjalan dari kanan ke
// kiri, mengulang tanpa putus.
//
// Ditaruh paling atas (bukan bawah) atas permintaan pemilik: kolom komentar
// TikTok menutupi area bawah layar penonton, jadi strip bawah akan
// terhalang komentar. Strip atas juga tidak menabrak header (mulai 2.2rem)
// maupun toast (jangkar bawah).
//
// Loop mulus: isi digandakan jadi dua span identik, animasi menggeser
// track sejauh -50%. Kecepatan konstan (px/detik) supaya teks tetap
// terbaca berapa pun panjang pesannya; durasi dihitung dari lebar span
// sesudah dirender. Modul ini bebas DOM saat import: elemen disuntik
// lewat konstruktor, pembuatan span bisa diganti pabrik palsu di test.

export const TICKER_SEPARATOR = "  ✦  ";
const FALLBACK_DURATION_SEC = 40;

export function buildTickerText(messages, separator = TICKER_SEPARATOR) {
  const list = (Array.isArray(messages) ? messages : [])
    .map((message) => String(message || "").trim())
    .filter(Boolean);
  if (list.length === 0) {
    return "";
  }
  return list.join(separator);
}

export function loopDurationSec(contentWidthPx, speedPxPerSec) {
  const width = Number(contentWidthPx);
  const speed = Number(speedPxPerSec);
  if (!Number.isFinite(width) || !Number.isFinite(speed) || width <= 0 || speed <= 0) {
    return FALLBACK_DURATION_SEC;
  }
  return Math.min(180, Math.max(10, width / speed));
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
    // Pemisah di ujung membuat jarak antar putaran sama dengan jarak
    // antar pesan, jadi sambungan loop tidak terlihat.
    const spanText = text + this.separator;
    this.track.appendChild(this._makeSpan(spanText));
    this.track.appendChild(this._makeSpan(spanText));
    const first = this.track.children ? this.track.children[0] : null;
    const width = first ? Number(first.offsetWidth) || 0 : 0;
    const duration = loopDurationSec(width, this.speed);
    if (this.track.style && typeof this.track.style.setProperty === "function") {
      this.track.style.setProperty("--ticker-duration", `${duration}s`);
    }
    this.container.hidden = false;
    this.started = true;
  }

  stop() {
    this.started = false;
    if (this.container) {
      this.container.hidden = true;
    }
  }
}
