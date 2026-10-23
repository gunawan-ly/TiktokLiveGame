import assert from "node:assert/strict";
import test from "node:test";

import {
  initialsFor,
  isSafeAvatarUrl,
  normalizeGiftMessage,
} from "../overlay/js/normalize.js";

function message(overrides = {}) {
  return {
    type: "gift",
    eventId: "evt-1",
    user: {
      username: "awanbalango",
      displayName: "Awan",
      avatarUrl: "https://cdn.example.com/a.webp",
    },
    gift: {
      id: 5655,
      name: "Rose",
      repeat: 5,
      coinsPerItem: 1,
      totalCoins: 5,
    },
    timestamp: "2026-10-23T11:57:00+08:00",
    ...overrides,
  };
}

test("normalizes a canonical gift", () => {
  const item = normalizeGiftMessage(message());
  assert.equal(item.displayName, "Awan");
  assert.equal(item.totalCoins, 5);
  assert.equal(item.giftName, "Rose");
});

test("computes total coins when missing", () => {
  const item = normalizeGiftMessage(
    message({ gift: { name: "Perfume", repeat: 5, coinsPerItem: 20 } }),
  );
  assert.equal(item.totalCoins, 100);
});

test("keeps safe avatar URLs and rejects unsafe schemes", () => {
  assert.equal(isSafeAvatarUrl("https://cdn.example.com/a.webp"), "https://cdn.example.com/a.webp");
  assert.equal(isSafeAvatarUrl("javascript:alert(1)"), "");
  assert.equal(isSafeAvatarUrl("data:text/html;base64,abc"), "");
  assert.equal(isSafeAvatarUrl("/overlay/assets/avatars/avatar-1.svg"), "/overlay/assets/avatars/avatar-1.svg");
});

test("produces initials from display names", () => {
  assert.equal(initialsFor("Awan"), "A");
  assert.equal(initialsFor("Roy jr7"), "RJ");
  assert.equal(initialsFor(""), "SP");
});

test("rejects non-gift messages", () => {
  assert.equal(normalizeGiftMessage({ type: "status" }), null);
  assert.equal(normalizeGiftMessage(null), null);
});
