import {
  DEPOSIT_FEE_RATE,
  FIXED_DEPOSIT_COST_RATE,
  FIXED_PAYOUT_RESERVE_RATE,
  MIN_DEPOSIT_KWACHA,
  MIN_WITHDRAW_KWACHA,
  PLATFORM_PROFIT_RATE,
  PAYOUT_FEE_RATE,
} from "./constants";

/** Whole tambala (1 kwacha = 100 tambala). Integers only. */
export type Tambala = number;

export function kwachaToTambala(kwacha: number): Tambala {
  return Math.round(kwacha * 100);
}

export function tambalaToKwacha(tambala: Tambala): number {
  return tambala / 100;
}

export function formatKwacha(tambala: Tambala, opts?: { compact?: boolean }): string {
  const value = tambalaToKwacha(tambala);
  const formatted = new Intl.NumberFormat("en-MW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return opts?.compact ? `MWK ${formatted}` : `${formatted} kwacha`;
}

export type DepositRateOverride = {
  /** Total deduction rate (e.g. 0.06). */
  depositFeeRate?: number;
  /** Override true-profit rate. If omitted, computed as total − fixed cost − fixed reserve. */
  platformProfitRate?: number;
  /** Override reserve rate. Defaults to FIXED_PAYOUT_RESERVE_RATE (2%). */
  payoutReserveRate?: number;
  /** Override deposit-cost rate. Defaults to FIXED_DEPOSIT_COST_RATE (1.5%). */
  depositCostRate?: number;
};

/**
 * Split a gross deposit into:
 *   fee          = total deduction (admin-configurable %)
 *   depositCost  = fixed 1.5% — system recovery (goes to platform)
 *   reserve      = fixed 2%   — withdrawal buffer
 *   profit       = remaining  — true platform profit
 *   credited     = gross − fee (what the user sees)
 *
 * Ledger stores platform_profit = depositCost + profit (both belong to the system).
 * Rounding: fee / cost / reserve are rounded independently; profit is the residual
 * so fee always equals depositCost + reserve + profit.
 */
export function splitDeposit(grossTambala: Tambala, rates?: DepositRateOverride) {
  const feeRate = rates?.depositFeeRate ?? DEPOSIT_FEE_RATE;
  const costRate = rates?.depositCostRate ?? FIXED_DEPOSIT_COST_RATE;
  const reserveRate = rates?.payoutReserveRate ?? FIXED_PAYOUT_RESERVE_RATE;

  const fee = Math.round(grossTambala * feeRate);
  const depositCost = Math.round(grossTambala * costRate);
  const reserve = Math.round(grossTambala * reserveRate);

  // True profit is whatever remains after the two fixed slices.
  let profit = fee - depositCost - reserve;
  if (profit < 0) {
    // Total fee was set below the fixed slices — absorb into reserve first.
    const shortfall = -profit;
    profit = 0;
    const reducedReserve = Math.max(0, reserve - shortfall);
    const stillShort = shortfall - (reserve - reducedReserve);
    const finalCost = Math.max(0, depositCost - stillShort);
    const credited = grossTambala - fee;
    return {
      gross: grossTambala,
      fee,
      depositCost: finalCost,
      reserve: reducedReserve,
      profit: 0,
      /** Amount booked as platform_profit on the transaction (cost + true profit). */
      platformProfit: finalCost,
      credited,
    };
  }

  const credited = grossTambala - fee;
  return {
    gross: grossTambala,
    fee,
    depositCost,
    reserve,
    profit,
    /** Amount booked as platform_profit on the transaction (cost + true profit). */
    platformProfit: depositCost + profit,
    credited,
  };
}

export function parseKwachaInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function validateDepositAmount(kwacha: number): string | null {
  if (!Number.isFinite(kwacha) || kwacha < MIN_DEPOSIT_KWACHA) {
    return `Minimum deposit is ${MIN_DEPOSIT_KWACHA} kwacha`;
  }
  return null;
}

export function validateWithdrawAmount(kwacha: number, balanceTambala: Tambala): string | null {
  if (!Number.isFinite(kwacha) || kwacha < MIN_WITHDRAW_KWACHA) {
    return `Minimum withdrawal is ${MIN_WITHDRAW_KWACHA} kwacha`;
  }
  const want = kwachaToTambala(kwacha);
  if (want > balanceTambala) {
    return "You can only withdraw the amount shown in your account";
  }
  return null;
}

export {
  DEPOSIT_FEE_RATE,
  PLATFORM_PROFIT_RATE,
  PAYOUT_FEE_RATE,
  FIXED_DEPOSIT_COST_RATE,
  FIXED_PAYOUT_RESERVE_RATE,
};
