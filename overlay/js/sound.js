// Layered print sounds, all synthesized with WebAudio (no audio assets).
//
// Three layers follow the machine's motion:
//   playPrint(durationMs) - process sound while a card prints: soft motor
//                           hum + paper noise + stepper ticks.
//   playFeed()            - paper swish when the sheet advances a row.
//   playRoll()            - soft thock when printed cards move to the roll.
//   playComplete(tier)    - completion chime; richer arpeggio per tier.
//   play(tier)            - backwards-compatible alias of playComplete.
//
// Everything runs through one master gain (settings.volume) and a
// compressor, so stacked sounds stay tame during a busy queue.

const COMPLETION_NOTES = {
  standard: [420, 540],
  bronze: [480, 620],
  silver: [620, 780, 930],
  gold: [740, 920, 1108, 1318],
  amethyst: [784, 988, 1175, 1397, 1568],
  diamond: [880, 1108, 1318, 1568, 1760],
  emerald: [659, 784, 988, 1319],
  ruby: [698, 880, 1046, 1319, 1568],
};

export class PrintSound {
  constructor(settings = {}) {
    this.enabled = Boolean(settings.enabled);
    this.volume = Number(settings.volume) || 0.25;
    this.context = null;
    this.master = null;
    this._noiseBuffer = null;
    this._printNodes = null;
  }

  _ensureContext() {
    if (!this.enabled) {
      return null;
    }
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return null;
      }
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 18;
      compressor.ratio.value = 6;
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
    }
    if (this.context.state === "suspended") {
      this.context.resume().catch(() => {});
    }
    return this.context;
  }

  _getNoiseBuffer(context) {
    if (!this._noiseBuffer) {
      const length = Math.max(1, Math.floor(context.sampleRate));
      this._noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = this._noiseBuffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) {
        data[index] = Math.random() * 2 - 1;
      }
    }
    return this._noiseBuffer;
  }

  _tone({ frequency, start, duration, type = "triangle", peak = 0.9, slideTo = null }) {
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  _noise({ start, duration, peak = 0.3, from = 600, to = null, q = 0.9 }) {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this._getNoiseBuffer(context);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(from, start);
    if (to) {
      filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    }
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.05, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.05);
    return { source, gain };
  }

  playPrint(durationMs = 2000) {
    const context = this._ensureContext();
    if (!context) {
      return;
    }
    this._stopPrint();
    const now = context.currentTime;
    const seconds = Math.max(0.4, Math.min(4.5, (Number(durationMs) || 2000) / 1000));

    // Motor hum: a low triangle that lives for the whole print.
    const humOscillator = context.createOscillator();
    humOscillator.type = "triangle";
    humOscillator.frequency.setValueAtTime(82, now);
    const humGain = context.createGain();
    humGain.gain.setValueAtTime(0.0001, now);
    humGain.gain.exponentialRampToValueAtTime(0.12, now + 0.09);
    humGain.gain.setValueAtTime(0.12, now + Math.max(0.1, seconds - 0.12));
    humGain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    humOscillator.connect(humGain);
    humGain.connect(this.master);
    humOscillator.start(now);
    humOscillator.stop(now + seconds + 0.05);

    // Paper texture: looping filtered noise under the hum.
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.16, now + 0.09);
    noiseGain.gain.setValueAtTime(0.16, now + Math.max(0.1, seconds - 0.12));
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    const noiseSource = context.createBufferSource();
    noiseSource.buffer = this._getNoiseBuffer(context);
    noiseSource.loop = true;
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 950;
    noiseFilter.Q.value = 0.6;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);
    noiseSource.start(now);
    noiseSource.stop(now + seconds + 0.05);

    // Stepper ticks while the head draws.
    const tickCount = Math.max(2, Math.floor(seconds / 0.24));
    for (let index = 0; index < tickCount; index += 1) {
      this._tone({
        frequency: index % 2 ? 1320 : 1180,
        start: now + 0.12 + index * 0.24,
        duration: 0.03,
        type: "square",
        peak: 0.045,
      });
    }

    this._printNodes = [humOscillator, noiseSource];
  }

  _stopPrint() {
    if (!this._printNodes) {
      return;
    }
    for (const node of this._printNodes) {
      try {
        node.stop();
      } catch {
        // Already stopped; nothing to clean up.
      }
    }
    this._printNodes = null;
  }

  playFeed() {
    const context = this._ensureContext();
    if (!context) {
      return;
    }
    const now = context.currentTime;
    this._noise({ start: now, duration: 0.3, peak: 0.35, from: 480, to: 2300, q: 0.8 });
  }

  playRoll() {
    const context = this._ensureContext();
    if (!context) {
      return;
    }
    const now = context.currentTime;
    this._tone({ frequency: 165, slideTo: 72, start: now, duration: 0.1, type: "sine", peak: 0.6 });
    this._noise({ start: now, duration: 0.05, peak: 0.18, from: 2600, q: 0.7 });
  }

  playComplete(tier = "standard") {
    const context = this._ensureContext();
    if (!context) {
      return;
    }
    this._stopPrint();
    const now = context.currentTime;
    const notes = COMPLETION_NOTES[tier] || COMPLETION_NOTES.standard;
    const spacing = tier === "diamond" ? 0.085 : 0.07;
    notes.forEach((frequency, index) => {
      const isLast = index === notes.length - 1;
      this._tone({
        frequency,
        start: now + index * spacing,
        duration: isLast && tier === "diamond" ? 0.55 : 0.24,
        type: "triangle",
        peak: 0.85,
      });
    });
    if (tier === "gold" || tier === "diamond") {
      // Shimmer: one quiet octave-up note ringing over the last note.
      const shimmerAt = now + notes.length * spacing;
      this._tone({
        frequency: notes[notes.length - 1] * 2,
        start: shimmerAt,
        duration: 0.4,
        type: "sine",
        peak: 0.22,
      });
    }
    if (tier === "diamond") {
      // Sparkle pings trailing the fanfare.
      this._tone({ frequency: 2093, start: now + 0.5, duration: 0.18, type: "sine", peak: 0.2 });
      this._tone({ frequency: 2637, start: now + 0.62, duration: 0.26, type: "sine", peak: 0.16 });
    }
  }

  play(tier = "standard") {
    this.playComplete(tier);
  }
}
