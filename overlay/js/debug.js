const TEST_GIFTS = {
  standard: { name: "Mawar", repeat: 1, coinsPerItem: 1, totalCoins: 1 },
  silver: { name: "Perfume", repeat: 1, coinsPerItem: 25, totalCoins: 25 },
  gold: { name: "Money Gun", repeat: 1, coinsPerItem: 50, totalCoins: 50 },
  amethyst: { name: "Galaxy Mini", repeat: 1, coinsPerItem: 100, totalCoins: 100 },
  diamond: { name: "Lion", repeat: 1, coinsPerItem: 29999, totalCoins: 29999 },
};

let debugSequence = 0;

export function setupDebugPanel({ enabled, pushGift, pushEmerald, clearQueue }) {
  const panel = document.getElementById("debugPanel");
  if (!panel) {
    return;
  }
  panel.hidden = !enabled;
  if (!enabled) {
    return;
  }

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-test]");
    if (!button) {
      return;
    }
    const test = button.dataset.test;
    if (test === "clear") {
      clearQueue();
      return;
    }
    if (test === "emerald") {
      pushEmerald?.(makeEmerald("pengetuk setia"));
      return;
    }
    if (test === "broken") {
      pushGift(makeGift("avatar rusak", { totalCoins: 250 }, "https://invalid.local/rusak.webp"));
      return;
    }
    if (test === "burst") {
      for (let index = 0; index < 5; index += 1) {
        window.setTimeout(() => {
          pushGift(makeGift(`antrean ${index + 1}`, { totalCoins: 1 }));
        }, index * 160);
      }
      return;
    }
    const gift = TEST_GIFTS[test];
    if (gift) {
      pushGift(makeGift("tester", gift));
    }
  });
}

function makeEmerald(displayName) {
  debugSequence += 1;
  return {
    type: "emerald_print",
    eventId: `debug-emerald-${Date.now().toString(36)}-${debugSequence}`,
    user: {
      username: `debug_tap_${debugSequence}`,
      displayName,
      avatarUrl: "",
    },
    likeTotal: 500,
    threshold: 500,
    timestamp: new Date().toISOString(),
  };
}

function makeGift(displayName, gift, avatarUrl = "") {
  debugSequence += 1;
  return {
    type: "gift",
    eventId: `debug-${Date.now().toString(36)}-${debugSequence}`,
    user: {
      username: `debug_${debugSequence}`,
      displayName,
      avatarUrl,
    },
    gift: {
      id: 0,
      name: gift.name || "Mawar",
      repeat: gift.repeat || 1,
      coinsPerItem: gift.coinsPerItem || 1,
      totalCoins: gift.totalCoins || 1,
    },
    timestamp: new Date().toISOString(),
  };
}
