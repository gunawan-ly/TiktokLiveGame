import test from "node:test";
import assert from "node:assert/strict";
import { MusicPlayer } from "../overlay/js/music.js";

// Test MusicPlayer (overlay/js/music.js) memakai audio palsu, tanpa DOM.
// Menjaga: tidak main kalau dinonaktifkan/tanpa lagu, urutan playlist,
// loop balik ke lagu pertama, dan unlock hanya sesudah start.

class FakeAudio {
  constructor() {
    this.src = "";
    this.volume = 1;
    this.loop = false;
    this.paused = true;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.listeners = new Map();
  }
  addEventListener(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }
  play() {
    this.playCalls += 1;
    this.paused = false;
    return undefined;
  }
  pause() {
    this.pauseCalls += 1;
    this.paused = true;
  }
  emitEnded() {
    for (const handler of this.listeners.get("ended") || []) {
      handler();
    }
  }
}

const TRACKS = ["./assets/music/calm-lofi.mp3", "./assets/music/haru-lofi.mp3"];

test("tidak main kalau music dinonaktifkan", () => {
  const audio = new FakeAudio();
  const music = new MusicPlayer({ audio, tracks: TRACKS, enabled: false });
  music.start();
  assert.equal(audio.playCalls, 0);
  assert.equal(audio.src, "");
});

test("tidak main kalau daftar lagu kosong", () => {
  const audio = new FakeAudio();
  const music = new MusicPlayer({ audio, tracks: [], enabled: true });
  music.start();
  assert.equal(audio.playCalls, 0);
});

test("start memutar lagu pertama dengan volume config", () => {
  const audio = new FakeAudio();
  const music = new MusicPlayer({ audio, tracks: TRACKS, volume: 0.15, enabled: true });
  music.start();
  assert.equal(audio.src, TRACKS[0]);
  assert.equal(audio.volume, 0.15);
  assert.equal(audio.loop, false);
  assert.equal(audio.playCalls, 1);
});

test("ended pindah ke lagu berikut dan loop balik ke pertama", () => {
  const audio = new FakeAudio();
  const music = new MusicPlayer({ audio, tracks: TRACKS, enabled: true });
  music.start();
  audio.emitEnded();
  assert.equal(audio.src, TRACKS[1]);
  assert.equal(audio.playCalls, 2);
  audio.emitEnded();
  assert.equal(audio.src, TRACKS[0]);
  assert.equal(audio.playCalls, 3);
});

test("unlock memutar lagi kalau terjeda, diam kalau belum start", () => {
  const audio = new FakeAudio();
  const music = new MusicPlayer({ audio, tracks: TRACKS, enabled: true });
  music.unlock();
  assert.equal(audio.playCalls, 0);
  music.start();
  audio.pause();
  music.unlock();
  assert.equal(audio.playCalls, 2);
});

test("stop menjeda dan menghentikan perpindahan lagu", () => {
  const audio = new FakeAudio();
  const music = new MusicPlayer({ audio, tracks: TRACKS, enabled: true });
  music.start();
  music.stop();
  assert.equal(audio.pauseCalls, 1);
  audio.emitEnded();
  assert.equal(audio.src, TRACKS[0]);
  assert.equal(audio.playCalls, 1);
});
