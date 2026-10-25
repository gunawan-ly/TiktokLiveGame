import assert from "node:assert/strict";
import test from "node:test";

import {
  emeraldLevelFor,
  normalizeTiers,
  tierAccent,
  tierForCoins,
  tierLabel,
} from "../overlay/js/tiers.js";

const tiers = normalizeTiers();

test("gift tier boundaries (bronze is likes-only)", () => {
  const cases = [
    [0, "standard"],
    [9, "standard"],
    [10, "silver"],
    [49, "silver"],
    [50, "gold"],
    [99, "gold"],
    [100, "amethyst"],
    [199, "amethyst"],
    [200, "diamond"],
    [29999, "diamond"],
  ];
  for (const [coins, expected] of cases) {
    assert.equal(tierForCoins(coins, tiers), expected, `coins=${coins}`);
  }
  // Gift tidak pernah menghasilkan bronze, berapa pun koinnya.
  for (const coins of [0, 5, 10, 50, 100, 200, 5000]) {
    assert.notEqual(tierForCoins(coins, tiers), "bronze", `coins=${coins}`);
  }
});

test("tier labels are available", () => {
  assert.equal(tierLabel("bronze", tiers), "BRONZE");
  assert.equal(tierLabel("silver", tiers), "SILVER");
  assert.equal(tierLabel("gold", tiers), "GOLD");
  assert.equal(tierLabel("amethyst", tiers), "AMETHYST");
  assert.equal(tierLabel("diamond", tiers), "DIAMOND");
  assert.equal(tierLabel("standard", tiers), "");
  assert.equal(tierAccent("amethyst"), "#a78bfa");
});

test("emerald is engagement-only: label exists, coins never produce it", () => {
  assert.equal(tierLabel("emerald", tiers), "EMERALD");
  assert.equal(tierAccent("emerald"), "#34d399");
  for (const coins of [0, 10, 200, 29999, 1_000_000]) {
    assert.notEqual(tierForCoins(coins, tiers), "emerald", `coins=${coins}`);
  }
});

test("emerald level naik di kelipatan ambang 3, 6, 10", () => {
  const cases = [
    [0, 1],
    [499, 1],
    [500, 1],
    [1000, 1],
    [1499, 1],
    [1500, 2],
    [2500, 2],
    [2999, 2],
    [3000, 3],
    [4999, 3],
    [5000, 4],
    [50000, 4],
  ];
  for (const [likes, expected] of cases) {
    assert.equal(emeraldLevelFor(likes, 500), expected, `likes=${likes}`);
  }
  // Ambang custom (tes) diskalakan dari kelipatan, bukan angka mutlak.
  assert.equal(emeraldLevelFor(30, 10), 2);
  assert.equal(emeraldLevelFor(100, 10), 4);
  assert.equal(emeraldLevelFor(undefined, undefined), 1);
});

test("custom thresholds override defaults", () => {
  const custom = normalizeTiers({
    bronze: { minCoins: 5 },
    silver: { minCoins: 20 },
    gold: { minCoins: 100 },
    diamond: { minCoins: 1000 },
  });
  // Nilai bronze diabaikan untuk gift: di bawah silver = standar.
  assert.equal(tierForCoins(5, custom), "standard");
  assert.equal(tierForCoins(19, custom), "standard");
  assert.equal(tierForCoins(20, custom), "silver");
  assert.equal(tierForCoins(99, custom), "silver");
  assert.equal(tierForCoins(100, custom), "gold");
  assert.equal(tierForCoins(1000, custom), "diamond");
});

test("gift thresholds stay ordered, bronze stays independent", () => {
  const custom = normalizeTiers({
    bronze: { minCoins: 500 },
    silver: { minCoins: 100 },
    gold: { minCoins: 50 },
    diamond: { minCoins: 1000 },
  });
  // Rantai gift diurutkan (gold yang terlalu rendah dinaikkan di atas silver),
  // sementara bronze jalur like tidak ikut dipaksa dan tidak memaksa gift.
  assert.equal(custom.bronze.minCoins, 500);
  assert.equal(custom.silver.minCoins, 100);
  assert.equal(custom.gold.minCoins, 101);
  assert.equal(custom.diamond.minCoins, 1000);
  assert.ok(custom.silver.minCoins < custom.gold.minCoins);
  assert.ok(custom.gold.minCoins < custom.diamond.minCoins);
});
