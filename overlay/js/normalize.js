let localSequence = 0;

function clampInteger(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function cleanText(value, fallback, limit = 80) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || fallback).slice(0, limit);
}

export function isSafeAvatarUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) {
    return "";
  }
  if (/^https?:\/\/[^\s]+$/i.test(url)) {
    return url;
  }
  if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);/i.test(url)) {
    return url;
  }
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
    return url;
  }
  return "";
}

export function initialsFor(name) {
  const parts = String(name ?? "")
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((part) => part[0]).join("").toUpperCase();
  return initials || "SP";
}

export function avatarHueFor(name) {
  let hash = 0;
  for (const character of String(name ?? "studio")) {
    hash = (hash * 31 + character.codePointAt(0)) % 360;
  }
  return 18 + (hash % 300);
}

// Tier emerald (Emerald) hanya lahir dari jalur engagement tap-tap:
// tierForCoins tidak pernah menghasilkannya karena bukan tier gift.
// Itemnya membawa tierOverride "emerald" dari normalizer pesan
// emerald_print, memakai antrean cetak yang sama, tanpa koin.
export function normalizeEmeraldMessage(message) {
  if (!message || message.type !== "emerald_print") {
    return null;
  }

  const user = message.user && typeof message.user === "object" ? message.user : {};

  const username = cleanText(
    user.username ?? user.displayName,
    "viewer",
    40,
  );
  const displayName = cleanText(user.displayName ?? username, username, 80);
  const likeTotal = clampInteger(message.likeTotal, 0, 0, 1_000_000_000);

  const eventId = cleanText(
    message.eventId,
    `local-emerald-${Date.now().toString(36)}-${++localSequence}`,
    120,
  );

  return {
    eventId,
    username,
    displayName,
    avatarUrl: isSafeAvatarUrl(user.avatarUrl),
    giftId: 0,
    giftName: "Tap-Tap",
    repeat: 1,
    coinsPerItem: 0,
    totalCoins: 0,
    likeTotal,
    tierOverride: "emerald",
    timestamp: cleanText(message.timestamp, new Date().toISOString(), 40),
  };
}

// Cetak Ruby dari jalur share: profil penonton dicetak saat total
// share-nya dalam satu sesi mencapai kelipatan ambang (default 5).
// Bukan gift: tidak membawa koin, menambah hitungan tercetak saja.
export function normalizeRubyMessage(message) {
  if (!message || message.type !== "ruby_print") {
    return null;
  }

  const user = message.user && typeof message.user === "object" ? message.user : {};

  const username = cleanText(
    user.username ?? user.displayName,
    "viewer",
    40,
  );
  const displayName = cleanText(user.displayName ?? username, username, 80);
  const shareTotal = clampInteger(message.shareTotal, 0, 0, 1_000_000_000);

  const eventId = cleanText(
    message.eventId,
    `local-ruby-${Date.now().toString(36)}-${++localSequence}`,
    120,
  );

  return {
    eventId,
    username,
    displayName,
    avatarUrl: isSafeAvatarUrl(user.avatarUrl),
    giftId: 0,
    giftName: "Share",
    repeat: 1,
    coinsPerItem: 0,
    totalCoins: 0,
    shareTotal,
    tierOverride: "ruby",
    timestamp: cleanText(message.timestamp, new Date().toISOString(), 40),
  };
}

// Popup sambutan penonton masuk: bukan cetakan, tidak lewat antrean
// cetak dan tidak membawa koin. Cukup identitas untuk notifikasi kecil
// di pojok kanan bawah.
export function normalizeJoinMessage(message) {
  if (!message || message.type !== "join") {
    return null;
  }

  const user = message.user && typeof message.user === "object" ? message.user : {};

  const username = cleanText(
    user.username ?? user.displayName,
    "viewer",
    40,
  );
  const displayName = cleanText(user.displayName ?? username, username, 80);

  const eventId = cleanText(
    message.eventId,
    `local-join-${Date.now().toString(36)}-${++localSequence}`,
    120,
  );

  return {
    eventId,
    username,
    displayName,
    avatarUrl: isSafeAvatarUrl(user.avatarUrl),
    timestamp: cleanText(message.timestamp, new Date().toISOString(), 40),
  };
}

export function normalizeGiftMessage(message) {
  if (!message || message.type !== "gift") {
    return null;
  }
  const user = message.user && typeof message.user === "object" ? message.user : {};
  const gift = message.gift && typeof message.gift === "object" ? message.gift : {};

  const username = cleanText(
    user.username ?? user.displayName,
    "viewer",
    40,
  );
  const displayName = cleanText(user.displayName ?? username, username, 80);
  const giftName = cleanText(gift.name, "Gift", 40);
  const repeat = clampInteger(gift.repeat, 1, 1, 1_000_000);
  const coinsPerItem = clampInteger(gift.coinsPerItem, 0, 0, 1_000_000_000);
  const computedTotal = repeat * coinsPerItem;
  const totalCoins = clampInteger(
    gift.totalCoins ?? message.totalCoins,
    computedTotal,
    0,
    1_000_000_000_000,
  );
  // Kelas bingkai mengikuti akumulasi koin si pengirim dalam satu sesi
  // (dari connector). Payload lama tanpa field ini jatuh ke total combo.
  const cumulativeCoins = clampInteger(
    message.cumulativeCoins,
    totalCoins,
    0,
    1_000_000_000_000,
  );

  const eventId = cleanText(
    message.eventId ?? gift.eventId,
    `local-${Date.now().toString(36)}-${++localSequence}`,
    120,
  );

  return {
    eventId,
    username,
    displayName,
    avatarUrl: isSafeAvatarUrl(user.avatarUrl),
    giftId: clampInteger(gift.id, 0, 0),
    giftName,
    repeat,
    coinsPerItem,
    totalCoins,
    cumulativeCoins,
    timestamp: cleanText(message.timestamp, new Date().toISOString(), 40),
  };
}
