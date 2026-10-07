import type { Sql } from "@/lib/db";
import {
  EARLY_UNLOCK_FEE_BASE_RATE,
  EARLY_UNLOCK_FEE_CAP_RATE,
  WITHDRAW_LOCK_COOLING_OFF_MS,
  WITHDRAW_LOCK_MAX_YEARS,
} from "./constants";

export type LockStatus = {
  active: boolean;
  until: string | null;
  startedAt: string | null;
  coolingEndsAt: string | null;
  originalUntil: string | null;
  inCoolingOff: boolean;
  canEditFree: boolean;
  adminWithdrawLocked: boolean;
  adminWithdrawLockReason: string | null;
  earlyUnlockFeeTambala: number;
  earlyUnlockFeeRate: number;
  remainingMs: number;
  originalDurationMs: number;
};

function asDate(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fee for ending the lock now: scales with remaining fraction of the original lock, capped. */
export function earlyUnlockFeeTambala(
  balanceTambala: number,
  remainingMs: number,
  originalDurationMs: number,
): { feeTambala: number; rate: number } {
  if (balanceTambala <= 0 || remainingMs <= 0 || originalDurationMs <= 0) {
    return { feeTambala: 0, rate: 0 };
  }
  const fraction = Math.min(1, remainingMs / originalDurationMs);
  const rate = Math.min(EARLY_UNLOCK_FEE_CAP_RATE, EARLY_UNLOCK_FEE_BASE_RATE * fraction);
  const fee = Math.round(balanceTambala * rate);
  return { feeTambala: fee, rate };
}

export async function loadLockStatus(
  sql: Sql,
  userId: string,
  balanceTambala: number,
): Promise<LockStatus> {
  const rows = await sql<{
    withdraw_lock_until: Date | string | null;
    withdraw_lock_started_at: Date | string | null;
    withdraw_lock_cooling_ends_at: Date | string | null;
    withdraw_lock_original_until: Date | string | null;
    admin_withdraw_locked_at: Date | string | null;
    admin_withdraw_lock_reason: string | null;
  }>`
    select withdraw_lock_until, withdraw_lock_started_at, withdraw_lock_cooling_ends_at,
           withdraw_lock_original_until, admin_withdraw_locked_at, admin_withdraw_lock_reason
    from profiles where user_id = ${userId} limit 1
  `;
  const r = rows[0];
  const until = asDate(r?.withdraw_lock_until);
  const started = asDate(r?.withdraw_lock_started_at);
  const coolingEnds = asDate(r?.withdraw_lock_cooling_ends_at);
  const originalUntil = asDate(r?.withdraw_lock_original_until);
  const now = Date.now();
  const active = Boolean(until && until.getTime() > now);
  const inCoolingOff = Boolean(active && coolingEnds && coolingEnds.getTime() > now);
  const remainingMs = active && until ? Math.max(0, until.getTime() - now) : 0;
  const originalDurationMs =
    started && originalUntil
      ? Math.max(1, originalUntil.getTime() - started.getTime())
      : remainingMs || 1;
  const fee = active && !inCoolingOff
    ? earlyUnlockFeeTambala(balanceTambala, remainingMs, originalDurationMs)
    : { feeTambala: 0, rate: 0 };

  return {
    active,
    until: until ? until.toISOString() : null,
    startedAt: started ? started.toISOString() : null,
    coolingEndsAt: coolingEnds ? coolingEnds.toISOString() : null,
    originalUntil: originalUntil ? originalUntil.toISOString() : null,
    inCoolingOff,
    canEditFree: inCoolingOff,
    adminWithdrawLocked: Boolean(r?.admin_withdraw_locked_at),
    adminWithdrawLockReason: r?.admin_withdraw_lock_reason ?? null,
    earlyUnlockFeeTambala: fee.feeTambala,
    earlyUnlockFeeRate: fee.rate,
    remainingMs,
    originalDurationMs,
  };
}

export function parseLockDuration(input: {
  amount: number;
  unit: "days" | "months" | "years";
}): { until: Date; ms: number } {
  const amount = Math.floor(input.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error("Enter a period of at least 1 day, month, or year.");
  }
  const now = new Date();
  const until = new Date(now);
  if (input.unit === "days") {
    if (amount > WITHDRAW_LOCK_MAX_YEARS * 366) {
      throw new Error(`Maximum lock is ${WITHDRAW_LOCK_MAX_YEARS} years.`);
    }
    until.setDate(until.getDate() + amount);
  } else if (input.unit === "months") {
    if (amount > WITHDRAW_LOCK_MAX_YEARS * 12) {
      throw new Error(`Maximum lock is ${WITHDRAW_LOCK_MAX_YEARS} years.`);
    }
    until.setMonth(until.getMonth() + amount);
  } else {
    if (amount > WITHDRAW_LOCK_MAX_YEARS) {
      throw new Error(`Maximum lock is ${WITHDRAW_LOCK_MAX_YEARS} years.`);
    }
    until.setFullYear(until.getFullYear() + amount);
  }
  const ms = until.getTime() - now.getTime();
  if (ms < 24 * 60 * 60 * 1000) {
    throw new Error("Lock period must be at least 1 day.");
  }
  const maxMs = WITHDRAW_LOCK_MAX_YEARS * 366 * 24 * 60 * 60 * 1000;
  if (ms > maxMs) {
    throw new Error(`Maximum lock is ${WITHDRAW_LOCK_MAX_YEARS} years.`);
  }
  return { until, ms };
}

export function coolingEndsFrom(start: Date = new Date()): Date {
  return new Date(start.getTime() + WITHDRAW_LOCK_COOLING_OFF_MS);
}

export async function logLockEvent(
  sql: Sql,
  opts: {
    userId: string;
    eventType: string;
    lockUntil?: Date | null;
    feeTambala?: number;
    detail?: string;
    actorUserId?: string | null;
  },
): Promise<void> {
  await sql`
    insert into withdraw_lock_events (user_id, event_type, lock_until, fee_tambala, detail, actor_user_id)
    values (
      ${opts.userId},
      ${opts.eventType},
      ${opts.lockUntil ?? null},
      ${opts.feeTambala ?? 0},
      ${opts.detail ?? null},
      ${opts.actorUserId ?? null}
    )
  `;
}
