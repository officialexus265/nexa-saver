import { test } from "node:test";
import assert from "node:assert/strict";
import { kwachaToTambala, splitDeposit, validateDepositAmount, validateWithdrawAmount } from "./money";

test("100 kwacha at 6%: 1.5 cost + 2 reserve + 2.5 profit = 6 fee, 94 credited", () => {
  const s = splitDeposit(kwachaToTambala(100));
  assert.equal(s.gross, 10000);
  assert.equal(s.fee, 600);
  assert.equal(s.depositCost, 150);
  assert.equal(s.reserve, 200);
  assert.equal(s.profit, 250);
  assert.equal(s.platformProfit, 400);
  assert.equal(s.credited, 9400);
  assert.equal(s.depositCost + s.reserve + s.profit, s.fee);
});

test("100 kwacha at 5%: 1.5 cost + 2 reserve + 1.5 profit", () => {
  const s = splitDeposit(kwachaToTambala(100), { depositFeeRate: 0.05 });
  assert.equal(s.fee, 500);
  assert.equal(s.depositCost, 150);
  assert.equal(s.reserve, 200);
  assert.equal(s.profit, 150);
  assert.equal(s.platformProfit, 300);
  assert.equal(s.credited, 9500);
  assert.equal(s.depositCost + s.reserve + s.profit, s.fee);
});

test("fee, cost, reserve and profit always reconcile", () => {
  for (const k of [100, 101, 133.33, 250, 999.99, 12345.67]) {
    for (const rate of [0.035, 0.05, 0.06, 0.08, 0.1]) {
      const s = splitDeposit(kwachaToTambala(k), { depositFeeRate: rate });
      assert.equal(s.credited + s.fee, s.gross);
      assert.equal(s.depositCost + s.reserve + s.profit, s.fee);
      assert.equal(s.platformProfit, s.depositCost + s.profit);
    }
  }
});

test("deposit and withdrawal limits", () => {
  assert.ok(validateDepositAmount(99));
  assert.equal(validateDepositAmount(100), null);
  assert.ok(validateWithdrawAmount(49, 100000));
  assert.equal(validateWithdrawAmount(50, 100000), null);
  assert.ok(validateWithdrawAmount(500, 9400), "cannot withdraw more than the balance");
});
