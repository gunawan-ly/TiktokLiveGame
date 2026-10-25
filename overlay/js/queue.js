const MAX_SEEN_IDS = 2000;

export class PrintQueue {
  constructor(maxItems = 100, gapMs = 0, engagementMaxItems = 30) {
    this.maxItems = Math.max(1, Math.floor(Number(maxItems) || 100));
    const engagementCap = Math.floor(Number(engagementMaxItems));
    this.engagementMaxItems = Number.isFinite(engagementCap)
      ? Math.max(0, engagementCap)
      : 30;
    this.gapMs = Math.max(0, Math.floor(Number(gapMs) || 0));
    this.items = [];
    this.state = "IDLE";
    this.current = null;
    this.seen = new Set();
    this.seenOrder = [];
    this._lastPrintedAt = new Map();
  }

  static senderKey(item) {
    return String(item?.username || item?.displayName || "").toLowerCase();
  }

  // Dua jalur cetak (keputusan Awan 25 Okt 2026): gift adalah jalur
  // prioritas; Emerald/Ruby adalah jalur engagement. Prioritas KAKU:
  // engagement hanya dicetak saat tidak ada gift yang siap cetak.
  static laneOf(item) {
    return item?.tierOverride === "emerald" || item?.tierOverride === "ruby"
      ? "engagement"
      : "gift";
  }

  _laneCount(lane) {
    return this.items.reduce(
      (count, item) => count + (PrintQueue.laneOf(item) === lane ? 1 : 0),
      0,
    );
  }

  _touchCooldown(sender, now) {
    this._lastPrintedAt.set(sender, now);
    for (const [key, at] of this._lastPrintedAt) {
      if (now - at > this.gapMs) {
        this._lastPrintedAt.delete(key);
      }
    }
  }

  _readyIndex(now) {
    // Prioritas kaku: pindai jalur gift dulu (FIFO di dalam jalur),
    // baru jalur engagement. Item yang pengirimnya masih cooldown
    // dilewati (skip-ahead) seperti sebelumnya, jadi mesin tidak
    // menganggur selama ada cetakan yang siap di jalur yang berhak.
    for (const lane of ["gift", "engagement"]) {
      for (const [index, item] of this.items.entries()) {
        if (PrintQueue.laneOf(item) !== lane) {
          continue;
        }
        const last = this._lastPrintedAt.get(PrintQueue.senderKey(item)) ?? 0;
        if (now - last >= this.gapMs) {
          return index;
        }
      }
    }
    return -1;
  }

  _waitUntil(now) {
    let earliest = Infinity;
    for (const item of this.items) {
      const readyAt =
        (this._lastPrintedAt.get(PrintQueue.senderKey(item)) ?? 0) + this.gapMs;
      if (readyAt <= now) {
        return 0;
      }
      earliest = Math.min(earliest, readyAt);
    }
    return earliest === Infinity ? null : Math.ceil(earliest - now);
  }

  push(item) {
    if (!item || !item.eventId) {
      return { ok: false, reason: "invalid" };
    }
    if (this.seen.has(item.eventId)) {
      return { ok: false, reason: "duplicate" };
    }
    // Kapasitas per jalur: engagement yang penuh tidak boleh lagi
    // menolak gift. Engagement ditolak dengan alasan terpisah supaya
    // overlay bisa membuangnya diam-diam (tanpa indikator layar).
    const lane = PrintQueue.laneOf(item);
    if (lane === "gift" && this._laneCount("gift") >= this.maxItems) {
      return { ok: false, reason: "full" };
    }
    if (
      lane === "engagement" &&
      this._laneCount("engagement") >= this.engagementMaxItems
    ) {
      return { ok: false, reason: "engagement_full" };
    }

    this.seen.add(item.eventId);
    this.seenOrder.push(item.eventId);
    if (this.seenOrder.length > MAX_SEEN_IDS) {
      const oldest = this.seenOrder.shift();
      this.seen.delete(oldest);
    }

    this.items.push(item);
    return { ok: true, length: this.items.length };
  }

  beginNext() {
    if (this.state !== "IDLE" || this.items.length === 0) {
      return null;
    }
    const now = Date.now();
    const index = this._readyIndex(now);
    if (index === -1) {
      return null;
    }
    const [chosen] = this.items.splice(index, 1);
    this.state = "PRINTING";
    this.current = chosen;
    this._touchCooldown(PrintQueue.senderKey(chosen), now);
    return chosen;
  }

  nextReadyIn(now = Date.now()) {
    if (this.items.length === 0) {
      return null;
    }
    return this.gapMs > 0 ? this._waitUntil(now) : 0;
  }

  finishPrint() {
    if (this.state !== "PRINTING") {
      return null;
    }
    const finished = this.current;
    this.current = null;
    this.state = "DONE";
    return finished;
  }

  markIdle() {
    if (this.state === "DONE") {
      this.state = "IDLE";
    }
  }

  clear() {
    const cleared = this.items.length;
    this.items = [];
    return cleared;
  }

  get length() {
    return this.items.length;
  }

  get busy() {
    return this.state !== "IDLE";
  }
}
