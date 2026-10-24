// Backsound lo-fi untuk live: playlist MP3 yang diputar berurutan dan
// mengulang (loop playlist), terpisah dari bunyi aksi WebAudio.
//
// Sengaja dibuat tanpa ketergantungan DOM: elemen audio disuntik lewat
// konstruktor (browser memakai `new Audio()`, test memakai audio palsu).
// Volume musik dijaga kecil (default 0.15) supaya bunyi aksi (master
// PrintSound 0.4) selalu lebih terdengar.
//
// Catatan autoplay HP: browser memblokir play() sebelum ada gestur. start()
// tetap dipanggil saat bootstrap; unlock() dipanggil dari gestur pertama
// (pointerdown sekali di app.js) supaya musik jalan sesudah layar diketuk.

export class MusicPlayer {
  constructor({ audio, tracks = [], volume = 0.15, enabled = false } = {}) {
    this.audio = audio || null;
    this.tracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
    this.volume = Number(volume);
    if (!Number.isFinite(this.volume)) {
      this.volume = 0.15;
    }
    this.volume = Math.min(1, Math.max(0, this.volume));
    this.enabled = Boolean(enabled);
    this.started = false;
    this.index = 0;
    if (this.audio && typeof this.audio.addEventListener === "function") {
      this.audio.addEventListener("ended", () => {
        if (!this.started) {
          return;
        }
        this._playIndex((this.index + 1) % this.tracks.length);
      });
    }
  }

  _playIndex(index) {
    if (!this.audio || this.tracks.length === 0) {
      return;
    }
    this.index = index;
    this.audio.loop = false;
    this.audio.preload = "auto";
    this.audio.volume = this.volume;
    this.audio.src = this.tracks[index];
    try {
      const result = this.audio.play();
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch {
      // Autoplay diblokir; unlock() dari gestur akan mencoba lagi.
    }
  }

  start() {
    if (!this.enabled || this.tracks.length === 0 || this.started) {
      return;
    }
    this.started = true;
    this._playIndex(0);
  }

  unlock() {
    if (!this.started || !this.audio) {
      return;
    }
    if (this.audio.paused) {
      try {
        const result = this.audio.play();
        if (result && typeof result.catch === "function") {
          result.catch(() => {});
        }
      } catch {
        // Tetap diam; gestur berikutnya mencoba lagi lewat SFX/bunyi.
      }
    }
  }

  stop() {
    this.started = false;
    if (!this.audio) {
      return;
    }
    try {
      this.audio.pause();
    } catch {
      // Abaikan; tidak ada yang perlu dibersihkan.
    }
  }
}
