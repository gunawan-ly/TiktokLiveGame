import assert from "node:assert/strict";
import test from "node:test";

import {
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
    [199, "gold"],
    [200, "diamond"],
    [29999, "diamond"],
  ];
  for (const [coins, expected] of cases) {
    assert.equal(tierForCoins(coins, tiers), expected, `coins=${coins}`);
  }
  // Gift tidak pernah menghasilkan bronze, berapa pun koinnya.
  for (const coins of [0, 5, 10, 50, 200, 5000]) {
    assert.notEqual(tierForCoins(coins, tiers), "bronze", `coins=${coins}`);
  }
});

test("tier labels are available", () => {
  assert.equal(tierLabel("bronze", tiers), "PERUNGGU");
  assert.equal(tierLabel("silver", tiers), "PERAK");
  assert.equal(tierLabel("gold", tiers), "EMAS");
  assert.equal(tierLabel("diamond", tiers), "BERLIAN");
  assert.equal(tierLabel("standard", tiers), "");
});

test("emerald is engagement-only: label exists, coins never produce it", () => {
  assert.equal(tierLabel("emerald", tiers), "ZAMRUD");
  assert.equal(tierAccent("emerald"), "#34d399");
  for (const coins of [0, 10, 200, 29999, 1_000_000]) {
    assert.notEqual(tierForCoins(coins, tiers), "emerald", `coins=${coins}`);
  }
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
