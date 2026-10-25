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

const JOINERS = ["Dewi", "Bima", "Sari", "Rizky", "Putri", "Eko"];

let sequence = 0;

function buildJoin(name, index) {
  sequence += 1;
  return {
    type: "join",
    eventId: `sim-join-${Date.now().toString(36)}-${sequence}`,
    user: {
      username: name.toLowerCase().replace(/\s+/g, "_"),
      displayName: name,
      avatarUrl: AVATAR_URLS[(index + 3) % AVATAR_URLS.length],
    },
    timestamp: new Date().toISOString(),
  };
}

let rubyStep = 0;

function buildRuby(index) {
  sequence += 1;
  rubyStep += 1;
  const shareTotal = rubyStep % 2 === 0 ? 10 : 5;
  return {
    type: "ruby_print",
    eventId: `sim-ruby-${Date.now().toString(36)}-${sequence}`,
    user: {
      username: "pembagi_setia",
      displayName: "Pembagi Setia",
      avatarUrl: AVATAR_URLS[(index + 5) % AVATAR_URLS.length],
    },
    shareTotal,
    threshold: 5,
    timestamp: new Date().toISOString(),
  };
}

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

export function startSimulation(pushGift, pushJoin, pushRuby) {
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
      // Sesekali ada penonton baru masuk: popup join muncul sebentar
      // sebelum gift berikutnya supaya fitur sambutannya terlihat.
      if (pushJoin && index % 3 === 2) {
        const joiner = JOINERS[Math.floor(index / 3) % JOINERS.length];
        pushJoin(buildJoin(joiner, index));
      }
      const scenario = SCENARIOS[index % SCENARIOS.length];
      pushGift(buildGift(scenario, index));
      // Sesekali penonton setia membagikan live: cetakan Ruby muncul
      // bergantian Lv1 (5 share) dan Lv2 (10 share).
      if (pushRuby && index % 4 === 3) {
        pushRuby(buildRuby(index));
      }
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
