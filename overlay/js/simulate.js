const AVATAR_URLS = Array.from({ length: 8 }, (_, index) =>
  new URL(`../assets/avatars/avatar-${index + 1}.svg`, import.meta.url).href
);

const SCENARIOS = [
  { name: "Awan", gift: "Mawar", totalCoins: 1, repeat: 1 },
  { name: "Lyra", gift: "Mawar", totalCoins: 20, repeat: 20 },
  { name: "Tings", gift: "Perfume", totalCoins: 100, repeat: 5 },
  { name: "Roy jr7", gift: "Money Gun", totalCoins: 500, repeat: 1 },
  { name: "Mbil", gift: "Lion", totalCoins: 29999, repeat: 1 },
  { name: "Wendri", gift: "Mawar", totalCoins: 2, repeat: 2 },
  { name: "Ash", gift: "Makeup Brush", totalCoins: 30, repeat: 30 },
  { name: "Rifa", gift: "Perfume", totalCoins: 120, repeat: 6 },
  { name: "Johan", gift: "Money Gun", totalCoins: 1000, repeat: 2 },
  { name: "Nabila", gift: "Mawar", totalCoins: 7, repeat: 7 },
];

let sequence = 0;

function buildGift(scenario, index) {
  sequence += 1;
  return {
    type: "gift",
    eventId: `sim-${Date.now().toString(36)}-${sequence}`,
    user: {
      username: scenario.name.toLowerCase().replace(/\s+/g, "_"),
      displayName: scenario.name,
      avatarUrl: AVATAR_URLS[index % AVATAR_URLS.length],
    },
    gift: {
      id: 0,
      name: scenario.gift,
      repeat: scenario.repeat,
      coinsPerItem: Math.max(1, Math.round(scenario.totalCoins / scenario.repeat)),
      totalCoins: scenario.totalCoins,
    },
    timestamp: new Date().toISOString(),
  };
}

export function startSimulation(pushGift) {
  let stopped = false;
  let timer = null;
  let index = 0;

  const schedule = () => {
    if (stopped) {
      return;
    }
    const delay = 3800 + Math.floor(Math.random() * 2600);
    timer = window.setTimeout(() => {
      if (stopped) {
        return;
      }
      const scenario = SCENARIOS[index % SCENARIOS.length];
      pushGift(buildGift(scenario, index));
      index += 1;

      if (index % 5 === 0) {
        for (let burst = 0; burst < 2; burst += 1) {
          window.setTimeout(() => {
            if (!stopped) {
              const extra = SCENARIOS[(index + burst) % SCENARIOS.length];
              pushGift(buildGift(extra, index + burst));
            }
          }, (burst + 1) * 180);
        }
      }
      schedule();
    }, delay);
  };

  schedule();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
