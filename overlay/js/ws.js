export class StudioSocket {
  constructor(url, handlers = {}) {
    this.url = url;
    this.handlers = handlers;
    this.socket = null;
    this.stopped = false;
    this.attempt = 0;
    this.timer = null;
    this.connected = false;
  }

  connect() {
    this.stopped = false;
    this._open();
  }

  _open() {
    if (this.stopped) {
      return;
    }
    this._setStatus("connecting", this.url);
    try {
      this.socket = new WebSocket(this.url);
    } catch (error) {
      this._setStatus("disconnected", "URL WebSocket tidak valid");
      this._scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => {
      this.connected = true;
      this.attempt = 0;
      this._setStatus("connected", "");
    });

    this.socket.addEventListener("message", (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        console.warn("Pesan bridge bukan JSON yang valid:", error);
        return;
      }
      if (!payload || typeof payload !== "object") {
        return;
      }
      if (payload.type === "gift") {
        this.handlers.onGift?.(payload);
      } else if (payload.type === "emerald_print") {
        this.handlers.onEmerald?.(payload);
      } else if (payload.type === "status") {
        this.handlers.onStatus?.(payload.connection || "disconnected", payload.detail || "");
      } else if (payload.type === "snapshot") {
        this.handlers.onSnapshot?.(payload);
      }
    });

    this.socket.addEventListener("close", () => {
      this.connected = false;
      if (this.stopped) {
        return;
      }
      this._setStatus("disconnected", "menyambung ulang...");
      this._scheduleReconnect();
    });

    this.socket.addEventListener("error", () => {
      this.connected = false;
    });
  }

  _scheduleReconnect() {
    clearTimeout(this.timer);
    const base = Math.min(15000, 1000 * 2 ** Math.min(this.attempt, 4));
    const delay = base + Math.floor(Math.random() * 350);
    this.attempt += 1;
    this.timer = setTimeout(() => this._open(), delay);
  }

  _setStatus(state, detail) {
    this.handlers.onStatus?.(state, detail);
  }

  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
