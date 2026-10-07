import type { Sql } from "@/lib/db";
import {
  DEPOSIT_FEE_RATE,
  EARLY_UNLOCK_FEE_BASE_RATE,
  EARLY_UNLOCK_FEE_CAP_RATE,
  PAYOUT_FEE_RATE,
  PLATFORM_PROFIT_RATE,
} from "./constants";

export type FeePolicy = {
  /** Total taken from gross deposit (e.g. 0.06 = 6%). */
  depositFeeRate: number;
  /** Share of gross booked as platform profit (subset of deposit fee). */
  platformProfitRate: number;
  /** Share of gross booked as payout reserve (subset of deposit fee). */
  payoutReserveRate: number;
  /** Early unlock base rate (scaled by remaining fraction). */
  earlyUnlockBaseRate: number;
  /** Early unlock hard cap (e.g. 0.03 = 3%). */
  earlyUnlockCapRate: number;
};

const KEYS = {
  deposit: "fee_deposit_rate",
  profit: "fee_platform_profit_rate",
  reserve: "fee_payout_reserve_rate",
  unlockBase: "fee_early_unlock_base_rate",
  unlockCap: "fee_early_unlock_cap_rate",
} as const;

function parseRate(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function getFeePolicy(sql: Sql): Promise<FeePolicy> {
  const rows = await sql<{ key: string; value: string }>`
    select key, value from platform_settings
    where key in (
      ${KEYS.deposit}, ${KEYS.profit}, ${KEYS.reserve}, ${KEYS.unlockBase}, ${KEYS.unlockCap}
    )
  `;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  let depositFeeRate = parseRate(map[KEYS.deposit], DEPOSIT_FEE_RATE, 0, 0.2);
  let platformProfitRate = parseRate(map[KEYS.profit], PLATFORM_PROFIT_RATE, 0, 0.2);
  let payoutReserveRate = parseRate(map[KEYS.reserve], PAYOUT_FEE_RATE, 0, 0.2);
  const earlyUnlockBaseRate = parseRate(map[KEYS.unlockBase], EARLY_UNLOCK_FEE_BASE_RATE, 0, 0.1);
  const earlyUnlockCapRate = parseRate(
    map[KEYS.unlockCap],
    Math.min(EARLY_UNLOCK_FEE_CAP_RATE, EARLY_UNLOCK_FEE_BASE_RATE),
    0,
    0.1,
  );

  // Keep profit + reserve aligned with total deposit fee when possible.
  if (Math.abs(platformProfitRate + payoutReserveRate - depositFeeRate) > 0.0005) {
    const half = depositFeeRate / 2;
    platformProfitRate = half;
    payoutReserveRate = depositFeeRate - half;
  }

  return {
    depositFeeRate,
    platformProfitRate,
    payoutReserveRate,
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
  const depositFeeRate = Math.min(0.2, Math.max(0, input.depositFeeRate));
  const earlyUnlockBaseRate = Math.min(0.1, Math.max(0, input.earlyUnlockBaseRate));
  let earlyUnlockCapRate = Math.min(0.1, Math.max(0, input.earlyUnlockCapRate));
  if (earlyUnlockCapRate < earlyUnlockBaseRate) earlyUnlockCapRate = earlyUnlockBaseRate;

  const half = depositFeeRate / 2;
  const platformProfitRate = half;
  const payoutReserveRate = depositFeeRate - half;

  await sql`
    insert into platform_settings (key, value, updated_at)
    values
      (${KEYS.deposit}, ${String(depositFeeRate)}, now()),
      (${KEYS.profit}, ${String(platformProfitRate)}, now()),
      (${KEYS.reserve}, ${String(payoutReserveRate)}, now()),
      (${KEYS.unlockBase}, ${String(earlyUnlockBaseRate)}, now()),
      (${KEYS.unlockCap}, ${String(earlyUnlockCapRate)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;

  return getFeePolicy(sql);
}
