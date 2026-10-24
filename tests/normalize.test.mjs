import assert from "node:assert/strict";
import test from "node:test";

import {
  initialsFor,
  isSafeAvatarUrl,
  normalizeEmeraldMessage,
  normalizeGiftMessage,
  normalizeJoinMessage,
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

test("cumulativeCoins drives the frame tier, combo total stays per combo", () => {
  const item = normalizeGiftMessage(message({ cumulativeCoins: 250 }));
  assert.equal(item.totalCoins, 5);
  assert.equal(item.cumulativeCoins, 250);
  // Payload lama tanpa cumulativeCoins jatuh ke total combo.
  assert.equal(normalizeGiftMessage(message()).cumulativeCoins, 5);
});

test("normalizes a join popup message", () => {
  const item = normalizeJoinMessage({
    type: "join",
    eventId: "join-runA-123",
    user: {
      username: "awanbalango",
      displayName: "Awan",
      avatarUrl: "https://cdn.example.com/a.webp",
    },
    timestamp: "2026-10-24T11:46:00+08:00",
  });
  assert.equal(item.displayName, "Awan");
  assert.equal(item.avatarUrl, "https://cdn.example.com/a.webp");
  assert.equal(item.eventId, "join-runA-123");
  assert.equal(normalizeJoinMessage(message()), null);
  assert.equal(normalizeJoinMessage(null), null);
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

test("normalizes an emerald print message", () => {
  const item = normalizeEmeraldMessage({
    type: "emerald_print",
    eventId: "emerald-run1-123",
    user: {
      username: "pengetuk",
      displayName: "Pengetuk Setia",
      avatarUrl: "https://cdn.example.com/a.webp",
    },
    likeTotal: 1000,
    threshold: 1000,
    timestamp: "2026-10-24T16:30:00+08:00",
  });
  assert.equal(item.displayName, "Pengetuk Setia");
  assert.equal(item.tierOverride, "emerald");
  assert.equal(item.likeTotal, 1000);
  // Zamrud tidak pernah membawa koin: bukan gift.
  assert.equal(item.totalCoins, 0);
  assert.equal(item.repeat, 1);
  assert.equal(item.giftName, "Tap-Tap");
});

test("emerald normalizer rejects other message types", () => {
  assert.equal(normalizeEmeraldMessage(message()), null);
  assert.equal(normalizeEmeraldMessage(null), null);
  assert.equal(normalizeGiftMessage({ type: "emerald_print" }), null);
});
