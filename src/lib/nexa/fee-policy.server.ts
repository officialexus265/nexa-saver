import type { Sql } from "@/lib/db";
import {
  DEPOSIT_FEE_RATE,
  EARLY_UNLOCK_FEE_BASE_RATE,
  EARLY_UNLOCK_FEE_CAP_RATE,
  FIXED_DEPOSIT_COST_RATE,
  FIXED_PAYOUT_RESERVE_RATE,
  MIN_DEPOSIT_FEE_RATE,
} from "./constants";

export type FeePolicy = {
  /** Total taken from gross deposit (e.g. 0.06 = 6%). Admin-configurable. */
  depositFeeRate: number;
  /**
   * True platform profit rate = total \u2212 fixed deposit cost \u2212 fixed reserve.
   * e.g. 6% total \u2192 2.5% profit; 5% total \u2192 1.5% profit.
   */
  platformProfitRate: number;
  /** Fixed withdrawal-reserve rate (default 2%). */
  payoutReserveRate: number;
  /** Fixed deposit-cost rate that reimburses the platform (default 1.5%). */
  depositCostRate: number;
  /** Early unlock base rate (scaled by remaining fraction). */
  earlyUnlockBaseRate: number;
  /** Early unlock hard cap (e.g. 0.03 = 3%). */
  earlyUnlockCapRate: number;
};

const KEYS = {
  deposit: "fee_deposit_rate",
  unlockBase: "fee_early_unlock_base_rate",
  unlockCap: "fee_early_unlock_cap_rate",
} as const;

function parseRate(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Derive profit / reserve / cost from a total deposit fee rate. */
export function deriveFeeSlices(depositFeeRate: number): {
  depositFeeRate: number;
  platformProfitRate: number;
  payoutReserveRate: number;
  depositCostRate: number;
} {
  const total = Math.min(0.2, Math.max(MIN_DEPOSIT_FEE_RATE, depositFeeRate));
  const depositCostRate = FIXED_DEPOSIT_COST_RATE;
  const payoutReserveRate = FIXED_PAYOUT_RESERVE_RATE;
  const platformProfitRate = Math.max(0, total - depositCostRate - payoutReserveRate);
  return { depositFeeRate: total, platformProfitRate, payoutReserveRate, depositCostRate };
}

export async function getFeePolicy(sql: Sql): Promise<FeePolicy> {
  const rows = await sql<{ key: string; value: string }>`
    select key, value from platform_settings
    where key in (
      ${KEYS.deposit}, ${KEYS.unlockBase}, ${KEYS.unlockCap}
    )
  `;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const depositFeeRate = parseRate(map[KEYS.deposit], DEPOSIT_FEE_RATE, MIN_DEPOSIT_FEE_RATE, 0.2);
  const slices = deriveFeeSlices(depositFeeRate);

  const earlyUnlockBaseRate = parseRate(map[KEYS.unlockBase], EARLY_UNLOCK_FEE_BASE_RATE, 0, 0.1);
  const earlyUnlockCapRate = parseRate(
    map[KEYS.unlockCap],
    Math.min(EARLY_UNLOCK_FEE_CAP_RATE, EARLY_UNLOCK_FEE_BASE_RATE),
    0,
    0.1,
  );

  return {
    ...slices,
    earlyUnlockBaseRate,
    earlyUnlockCapRate: Math.min(earlyUnlockCapRate, Math.max(earlyUnlockBaseRate, earlyUnlockCapRate)),
  };
}

export async function setFeePolicy(
  sql: Sql,
  input: {
    depositFeeRate: number;
    earlyUnlockBaseRate: number;
    earlyUnlockCapRate: number;
  },
): Promise<FeePolicy> {
  const depositFeeRate = Math.min(0.2, Math.max(MIN_DEPOSIT_FEE_RATE, input.depositFeeRate));
  const earlyUnlockBaseRate = Math.min(0.1, Math.max(0, input.earlyUnlockBaseRate));
  let earlyUnlockCapRate = Math.min(0.1, Math.max(0, input.earlyUnlockCapRate));
  if (earlyUnlockCapRate < earlyUnlockBaseRate) earlyUnlockCapRate = earlyUnlockBaseRate;

  const slices = deriveFeeSlices(depositFeeRate);

  // Only persist the total + unlock rates. Profit/reserve/cost are always derived
  // from the fixed 1.5% + 2% model so they cannot drift.
  await sql`
    insert into platform_settings (key, value, updated_at)
    values
      (${KEYS.deposit}, ${String(slices.depositFeeRate)}, now()),
      (${KEYS.unlockBase}, ${String(earlyUnlockBaseRate)}, now()),
      (${KEYS.unlockCap}, ${String(earlyUnlockCapRate)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;

  return getFeePolicy(sql);
}
