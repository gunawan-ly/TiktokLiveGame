import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as wait } from "node:timers/promises";

import { PrintQueue } from "../overlay/js/queue.js";

function gift(id, extra = {}) {
  return { eventId: id, ...extra };
}

test("queue is FIFO and ignores duplicates", () => {
  const queue = new PrintQueue();
  assert.equal(queue.push(gift("a")).ok, true);
  assert.equal(queue.push(gift("b")).ok, true);
  assert.equal(queue.push(gift("a")).ok, false);
  assert.equal(queue.length, 2);

  assert.equal(queue.beginNext().eventId, "a");
  assert.equal(queue.state, "PRINTING");
  assert.equal(queue.finishPrint().eventId, "a");
  assert.equal(queue.state, "DONE");
  queue.markIdle();
  assert.equal(queue.state, "IDLE");
  assert.equal(queue.beginNext().eventId, "b");
});

test("emerald items flow through the queue with their tier override", () => {
  const queue = new PrintQueue();
  const emerald = gift("emerald-run1-123", {
    username: "pengetuk",
    totalCoins: 0,
    likeTotal: 1000,
    tierOverride: "emerald",
  });
  assert.equal(queue.push(emerald).ok, true);
  // Replay dengan eventId yang sama ditolak (dedupe melindungi cetak ganda).
  assert.equal(queue.push(emerald).ok, false);
  const chosen = queue.beginNext();
  assert.equal(chosen.tierOverride, "emerald");
  assert.equal(chosen.totalCoins, 0);
});

test("beginNext cannot interrupt a running print", () => {
  const queue = new PrintQueue();
  queue.push(gift("a"));
  queue.push(gift("b"));
  queue.beginNext();
  assert.equal(queue.beginNext(), null);
  assert.equal(queue.length, 1);
});

test("clear only removes waiting items", () => {
  const queue = new PrintQueue();
  queue.push(gift("a"));
  queue.push(gift("b"));
  queue.push(gift("c"));
  queue.beginNext();
  assert.equal(queue.clear(), 2);
  assert.equal(queue.length, 0);
  assert.equal(queue.state, "PRINTING");
});

test("invalid items are rejected", () => {
  const queue = new PrintQueue();
  assert.equal(queue.push(null).reason, "invalid");
  assert.equal(queue.push({}).reason, "invalid");
});

test("queue enforces capacity limit", () => {
  const queue = new PrintQueue(2);
  assert.equal(queue.push(gift("a")).ok, true);
  assert.equal(queue.push(gift("b")).ok, true);
  const third = queue.push(gift("c"));
  assert.equal(third.ok, false);
  assert.equal(third.reason, "full");
  assert.equal(queue.length, 2);
});

test("skip-ahead prints other senders while one sender cools down", () => {
  const queue = new PrintQueue(100, 60_000);
  queue.push(gift("a", { username: "awan" }));
  queue.push(gift("b", { username: "lyra" }));
  queue.push(gift("c", { username: "awan" }));

  assert.equal(queue.beginNext().eventId, "a");
  queue.finishPrint();
  queue.markIdle();
  assert.equal(queue.beginNext().eventId, "b");
  queue.finishPrint();
  queue.markIdle();
  // "awan" masih dalam jeda, jadi item kedua milik awan ditahan.
  assert.equal(queue.beginNext(), null);
  assert.equal(queue.length, 1);
});

test("queue waits instead of printing when all items cool down", async () => {
  const queue = new PrintQueue(100, 20);
  queue.push(gift("a", { username: "satu" }));
  queue.push(gift("b", { username: "satu" }));
  assert.equal(queue.beginNext().eventId, "a");
  queue.finishPrint();
  queue.markIdle();
  assert.equal(queue.beginNext(), null);

  const waitMs = queue.nextReadyIn();
  assert.ok(waitMs > 0 && waitMs <= 20);
  await wait(40);
  assert.equal(queue.beginNext().eventId, "b");
});

test("nextReadyIn is zero when a queued sender is ready now", () => {
  const queue = new PrintQueue(100, 5_000);
  queue.push(gift("a", { username: "awan" }));
  assert.equal(queue.nextReadyIn(), 0);
});

test("zero gap keeps strict FIFO even for repeated senders", () => {
  const queue = new PrintQueue(100, 0);
  queue.push(gift("a", { username: "satu" }));
  queue.push(gift("b", { username: "satu" }));
  assert.equal(queue.beginNext().eventId, "a");
  queue.finishPrint();
  queue.markIdle();
  assert.equal(queue.beginNext().eventId, "b");
});

test("cooldown does not cause dedupe collisions between items", () => {
  const queue = new PrintQueue(100, 5_000);
  assert.equal(queue.push(gift("a", { username: "satu" })).ok, true);
  assert.equal(queue.push(gift("b", { username: "satu" })).ok, true);
  assert.equal(queue.length, 2);
});

test("gift prints jump ahead of earlier engagement prints (strict priority)", () => {
  const queue = new PrintQueue();
  queue.push(gift("e1", { tierOverride: "emerald" }));
  queue.push(gift("r1", { tierOverride: "ruby" }));
  queue.push(gift("g1"));
  assert.equal(queue.beginNext().eventId, "g1");
  queue.finishPrint();
  queue.markIdle();
  // Jalur gift kosong: engagement jalan, FIFO di dalam jalurnya.
  assert.equal(queue.beginNext().eventId, "e1");
  queue.finishPrint();
  queue.markIdle();
  assert.equal(queue.beginNext().eventId, "r1");
});

test("engagement lane capacity is separate and never blocks gifts", () => {
  const queue = new PrintQueue(2, 0, 2);
  assert.equal(queue.push(gift("e1", { tierOverride: "emerald" })).ok, true);
  assert.equal(queue.push(gift("e2", { tierOverride: "emerald" })).ok, true);
  const dropped = queue.push(gift("e3", { tierOverride: "emerald" }));
  assert.equal(dropped.ok, false);
  assert.equal(dropped.reason, "engagement_full");
  // Gift tetap diterima walau jalur engagement penuh.
  assert.equal(queue.push(gift("g1")).ok, true);
  assert.equal(queue.push(gift("g2")).ok, true);
  const full = queue.push(gift("g3"));
  assert.equal(full.ok, false);
  assert.equal(full.reason, "full");
  assert.equal(queue.length, 4);
});

test("a cooling-down gift does not idle the machine when engagement is ready", () => {
  const queue = new PrintQueue(100, 60_000);
  queue.push(gift("g1", { username: "pengirim" }));
  assert.equal(queue.beginNext().eventId, "g1");
  queue.finishPrint();
  queue.markIdle();
  // Gift kedua dari pengirim yang sama masih cooldown; Emerald dari
  // penonton lain sudah siap, jadi mesin mencetak Emerald lebih dulu
  // daripada menganggur (prioritas berlaku di antara yang SIAP cetak).
  queue.push(gift("g2", { username: "pengirim" }));
  queue.push(gift("e1", { username: "pengetuk", tierOverride: "emerald" }));
  assert.equal(queue.beginNext().eventId, "e1");
});
