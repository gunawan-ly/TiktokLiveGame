export class PrintSound {
  constructor(settings = {}) {
    this.enabled = Boolean(settings.enabled);
    this.volume = Number(settings.volume) || 0.25;
    this.context = null;
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
    }
    if (this.context.state === "suspended") {
      this.context.resume().catch(() => {});
    }
    return this.context;
  }

  play(tier = "standard") {
    const context = this._ensureContext();
    if (!context) {
      return;
    }
    const now = context.currentTime;
    const frequencies = {
      standard: [420, 540],
      bronze: [480, 620],
      silver: [620, 820],
      gold: [740, 980],
      diamond: [880, 1240],
    };
    const [first, second] = frequencies[tier] || frequencies.standard;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(first, now);
    oscillator.frequency.exponentialRampToValueAtTime(second, now + 0.11);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(this.volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  }
}
