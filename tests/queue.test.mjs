import assert from "node:assert/strict";
import test from "node:test";

import { PrintQueue } from "../overlay/js/queue.js";

function gift(id) {
  return { eventId: id };
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
