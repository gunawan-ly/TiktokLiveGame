const MAX_SEEN_IDS = 2000;

export class PrintQueue {
  constructor() {
    this.items = [];
    this.state = "IDLE";
    this.current = null;
    this.seen = new Set();
    this.seenOrder = [];
  }

  push(item) {
    if (!item || !item.eventId) {
      return { ok: false, reason: "invalid" };
    }
    if (this.seen.has(item.eventId)) {
      return { ok: false, reason: "duplicate" };
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
    this.state = "PRINTING";
    this.current = this.items.shift();
    return this.current;
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
