import { test } from "node:test";
import assert from "node:assert/strict";
import { kwachaToTambala, splitDeposit, validateDepositAmount, validateWithdrawAmount } from "./money";

test("a 100 kwacha deposit: 6 reserved, 94 credited, 3 profit, 3 payout reserve", () => {
  const s = splitDeposit(kwachaToTambala(100));
  assert.deepEqual(s, { gross: 10000, fee: 600, profit: 300, reserve: 300, credited: 9400 });
});

test("fee, credit and gross always reconcile", () => {
  for (const k of [100, 101, 133.33, 250, 999.99, 12345.67]) {
    const s = splitDeposit(kwachaToTambala(k));
    assert.equal(s.credited + s.fee, s.gross);
    assert.ok(Math.abs(s.profit + s.reserve - s.fee) <= 1, `profit+reserve ~ fee for ${k}`);
  }
});

test("deposit and withdrawal limits", () => {
  assert.ok(validateDepositAmount(99));
  assert.equal(validateDepositAmount(100), null);
  assert.ok(validateWithdrawAmount(49, 100000));
  assert.equal(validateWithdrawAmount(50, 100000), null);
  assert.ok(validateWithdrawAmount(500, 9400), "cannot withdraw more than the balance");
});
