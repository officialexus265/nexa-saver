import {
  DEPOSIT_FEE_RATE,
  MIN_DEPOSIT_KWACHA,
  MIN_WITHDRAW_KWACHA,
  PAYOUT_FEE_RATE,
  PLATFORM_PROFIT_RATE,
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
  depositFeeRate?: number;
  platformProfitRate?: number;
  payoutReserveRate?: number;
};

export function splitDeposit(grossTambala: Tambala, rates?: DepositRateOverride) {
  const feeRate = rates?.depositFeeRate ?? DEPOSIT_FEE_RATE;
  const profitRate = rates?.platformProfitRate ?? PLATFORM_PROFIT_RATE;
  const reserveRate = rates?.payoutReserveRate ?? PAYOUT_FEE_RATE;
  const fee = Math.round(grossTambala * feeRate);
  const profit = Math.round(grossTambala * profitRate);
  const reserve = Math.round(grossTambala * reserveRate);
  const credited = grossTambala - fee;
  return { gross: grossTambala, fee, profit, reserve, credited };
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

export { DEPOSIT_FEE_RATE, PLATFORM_PROFIT_RATE, PAYOUT_FEE_RATE };
