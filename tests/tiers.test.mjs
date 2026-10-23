import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTiers,
  tierForCoins,
  tierLabel,
} from "../overlay/js/tiers.js";

const tiers = normalizeTiers();

test("tier boundaries follow the PRD", () => {
  const cases = [
    [0, "standard"],
    [9, "standard"],
    [10, "bronze"],
    [99, "bronze"],
    [100, "silver"],
    [499, "silver"],
    [500, "gold"],
    [4999, "gold"],
    [5000, "diamond"],
    [29999, "diamond"],
  ];
  for (const [coins, expected] of cases) {
    assert.equal(tierForCoins(coins, tiers), expected, `coins=${coins}`);
  }
});

test("tier labels are available", () => {
  assert.equal(tierLabel("bronze", tiers), "PERUNGGU");
  assert.equal(tierLabel("silver", tiers), "PERAK");
  assert.equal(tierLabel("gold", tiers), "EMAS");
  assert.equal(tierLabel("diamond", tiers), "BERLIAN");
  assert.equal(tierLabel("standard", tiers), "");
});

test("custom thresholds override defaults", () => {
  const custom = normalizeTiers({
    bronze: { minCoins: 5 },
    silver: { minCoins: 20 },
    gold: { minCoins: 100 },
    diamond: { minCoins: 1000 },
  });
  assert.equal(tierForCoins(5, custom), "bronze");
  assert.equal(tierForCoins(19, custom), "bronze");
  assert.equal(tierForCoins(20, custom), "silver");
  assert.equal(tierForCoins(1000, custom), "diamond");
});

test("invalid thresholds stay ordered", () => {
  const custom = normalizeTiers({
    bronze: { minCoins: 500 },
    silver: { minCoins: 10 },
    gold: { minCoins: 100 },
    diamond: { minCoins: 1000 },
  });
  assert.ok(custom.silver.minCoins > custom.bronze.minCoins);
  assert.ok(custom.gold.minCoins > custom.silver.minCoins);
  assert.ok(custom.diamond.minCoins > custom.gold.minCoins);
});
