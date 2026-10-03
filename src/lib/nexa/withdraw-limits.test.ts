import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_RAISE_AFTER_DAYS,
  AUTO_RAISE_CAP_KWACHA,
  FINAL_DAILY_WITHDRAW_CAP_KWACHA,
  NEAR_LIMIT_RATIO,
  STARTING_DAILY_WITHDRAW_CAP_KWACHA,
  TIER_HOLD_DAYS,
  WITHDRAW_CAP_LADDER_KWACHA,
} from "./constants";
import { accountAgeDays, catDayBounds } from "./withdraw-limits.server";
import { kwachaToTambala } from "./money";

test("ladder starts at 100k and ends at 1M", () => {
  assert.equal(STARTING_DAILY_WITHDRAW_CAP_KWACHA, 100_000);
  assert.equal(AUTO_RAISE_CAP_KWACHA, 250_000);
  assert.equal(FINAL_DAILY_WITHDRAW_CAP_KWACHA, 1_000_000);
  assert.deepEqual([...WITHDRAW_CAP_LADDER_KWACHA], [100_000, 250_000, 350_000, 500_000, 800_000, 1_000_000]);
});

test("auto-raise timing constants", () => {
  assert.equal(AUTO_RAISE_AFTER_DAYS, 14);
  assert.equal(TIER_HOLD_DAYS, 31);
  assert.equal(NEAR_LIMIT_RATIO, 0.9);
});

test("near-limit threshold for 250k is 225k tambala floor", () => {
  const threshold = Math.floor(kwachaToTambala(250_000) * NEAR_LIMIT_RATIO);
  assert.equal(threshold, 22_500_000); // 225_000 * 100
});

test("accountAgeDays floors whole days", () => {
  const now = Date.parse("2026-03-15T12:00:00+02:00");
  const created = new Date("2026-03-01T12:00:00+02:00");
  assert.equal(accountAgeDays(created, now), 14);
});

test("catDayBounds spans exactly 24 hours in CAT", () => {
  const now = new Date("2026-03-14T23:30:00.000Z"); // 15 Mar 01:30 CAT
  const { start, end } = catDayBounds(now);
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
  // Start should be 00:00 CAT on that calendar day (UTC+2 → 22:00 UTC previous evening).
  assert.equal(start.toISOString(), "2026-03-14T22:00:00.000Z");
});
