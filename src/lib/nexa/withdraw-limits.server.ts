import type { Sql } from "@/lib/db";
import {
  AUTO_RAISE_AFTER_DAYS,
  AUTO_RAISE_CAP_KWACHA,
  BUSINESS_TZ,
  FINAL_DAILY_WITHDRAW_CAP_KWACHA,
  NEAR_LIMIT_RATIO,
  NEW_ACCOUNT_WITHDRAW_HOLD_MS,
  PLATFORM_SUPPORT_PHONE_KEY,
  STARTING_DAILY_WITHDRAW_CAP_KWACHA,
  TIER_HOLD_DAYS,
  WITHDRAW_CAP_LADDER_KWACHA,
} from "./constants";
import { formatKwacha, kwachaToTambala } from "./money";

function asInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toMs(value: unknown): number {
  if (value == null || value === "") return 0;
  if (value instanceof Date) return value.getTime();
  const n = Date.parse(String(value));
  return Number.isFinite(n) ? n : 0;
}

export function formatHoldUntil(isoOrDate: Date | string | number): string {
  const d = typeof isoOrDate === "number" ? new Date(isoOrDate) : new Date(isoOrDate);
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: BUSINESS_TZ,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function holdMessage(untilMs: number): string {
  return (
    `Withdrawals are on a short hold until ${formatHoldUntil(untilMs)}. ` +
    `This is normal after opening an account or changing security settings. Your balance is safe.`
  );
}

export function effectiveHoldUntilMs(profile: {
  created_at: unknown;
  withdrawals_held_until?: unknown;
}): number {
  const now = Date.now();
  const createdMs = toMs(profile.created_at);
  const newAccountUntil = createdMs ? createdMs + NEW_ACCOUNT_WITHDRAW_HOLD_MS : 0;
  const explicitUntil = toMs(profile.withdrawals_held_until);
  const until = Math.max(newAccountUntil, explicitUntil);
  return until > now ? until : 0;
}

export async function extendWithdrawHold(sql: Sql, userId: string, until: Date): Promise<void> {
  await sql`
    update profiles
    set withdrawals_held_until = case
          when withdrawals_held_until is null or withdrawals_held_until < ${until}
          then ${until}
          else withdrawals_held_until
        end,
        updated_at = now()
    where user_id = ${userId}
  `;
}

export function catDayBounds(now = new Date()): { start: Date; end: Date } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  const start = new Date(`${y}-${m}-${d}T00:00:00+02:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function accountAgeDays(createdAt: unknown, now = Date.now()): number {
  const createdMs = toMs(createdAt);
  if (!createdMs) return 0;
  return Math.max(0, Math.floor((now - createdMs) / (24 * 60 * 60 * 1000)));
}

function nextLadderCap(currentKwacha: number): number | null {
  for (let i = 0; i < WITHDRAW_CAP_LADDER_KWACHA.length - 1; i += 1) {
    if (WITHDRAW_CAP_LADDER_KWACHA[i] === currentKwacha) {
      return WITHDRAW_CAP_LADDER_KWACHA[i + 1]!;
    }
  }
  // If somehow between ladder steps, jump to the next higher listed tier.
  for (const step of WITHDRAW_CAP_LADDER_KWACHA) {
    if (step > currentKwacha) return step;
  }
  return null;
}

export type CapProfile = {
  created_at: unknown;
  withdrawals_held_until?: unknown;
  daily_withdraw_cap_kwacha?: number | null;
  withdraw_cap_updated_at?: unknown;
};

/**
 * Apply the automatic 14-day raise (100k → 250k) if due.
 * Returns the effective cap in kwacha after any auto-raise written to the DB.
 */
export async function ensureAutoCapRaise(sql: Sql, userId: string, profile: CapProfile): Promise<number> {
  const stored = asInt(profile.daily_withdraw_cap_kwacha) || STARTING_DAILY_WITHDRAW_CAP_KWACHA;
  const age = accountAgeDays(profile.created_at);

  if (age >= AUTO_RAISE_AFTER_DAYS && stored < AUTO_RAISE_CAP_KWACHA) {
    await sql`
      update profiles
      set daily_withdraw_cap_kwacha = ${AUTO_RAISE_CAP_KWACHA},
          withdraw_cap_updated_at = now(),
          updated_at = now()
      where user_id = ${userId}
        and daily_withdraw_cap_kwacha < ${AUTO_RAISE_CAP_KWACHA}
    `;
    return AUTO_RAISE_CAP_KWACHA;
  }
  return stored;
}

/**
 * After a successful withdrawal: if the amount was close to the current daily
 * limit and the user has been on this tier for at least TIER_HOLD_DAYS, raise
 * the cap one step on the ladder (up to the final automatic limit).
 */
export async function maybeRaiseCapAfterNearLimitWithdraw(
  sql: Sql,
  opts: {
    userId: string;
    amountTambala: number;
    profile: CapProfile;
  },
): Promise<{ raised: boolean; newCapKwacha: number }> {
  const before = asInt(opts.profile.daily_withdraw_cap_kwacha) || STARTING_DAILY_WITHDRAW_CAP_KWACHA;
  const current = await ensureAutoCapRaise(sql, opts.userId, opts.profile);
  // Auto-raise (100k → 250k) just applied — do not also climb a conditional tier in the same step.
  if (current > before) {
    return { raised: true, newCapKwacha: current };
  }
  if (current >= FINAL_DAILY_WITHDRAW_CAP_KWACHA) {
    return { raised: false, newCapKwacha: current };
  }

  const thresholdTambala = Math.floor(kwachaToTambala(current) * NEAR_LIMIT_RATIO);
  if (opts.amountTambala < thresholdTambala) {
    return { raised: false, newCapKwacha: current };
  }

  // Days on *this* tier (since last cap change). Conditional raises need ≥ 31 days.
  const updatedMs = toMs(opts.profile.withdraw_cap_updated_at) || toMs(opts.profile.created_at);
  const daysOnTier = updatedMs
    ? Math.floor((Date.now() - updatedMs) / (24 * 60 * 60 * 1000))
    : 0;
  // Starting tier (100k) only moves via the 14-day auto-raise, not this path.
  if (current < AUTO_RAISE_CAP_KWACHA) {
    return { raised: false, newCapKwacha: current };
  }
  if (daysOnTier < TIER_HOLD_DAYS) {
    return { raised: false, newCapKwacha: current };
  }

  const next = nextLadderCap(current);
  if (next == null || next <= current) {
    return { raised: false, newCapKwacha: current };
  }

  await sql`
    update profiles
    set daily_withdraw_cap_kwacha = ${next},
        withdraw_cap_updated_at = now(),
        updated_at = now()
    where user_id = ${userId}
      and daily_withdraw_cap_kwacha = ${current}
  `;
  return { raised: true, newCapKwacha: next };
}

export async function getSupportPhone(sql: Sql): Promise<string | null> {
  const rows = await sql<{ value: string }>`
    select value from platform_settings where key = ${PLATFORM_SUPPORT_PHONE_KEY} limit 1
  `;
  const v = rows[0]?.value?.trim();
  return v || null;
}

export async function setSupportPhone(sql: Sql, phone: string): Promise<void> {
  await sql`
    insert into platform_settings (key, value, updated_at)
    values (${PLATFORM_SUPPORT_PHONE_KEY}, ${phone}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function withdrawnTodayTambala(sql: Sql, userId: string): Promise<number> {
  const { start, end } = catDayBounds();
  const rows = await sql<{ total: number }>`
    select coalesce(sum(gross_tambala), 0)::bigint as total
    from transactions
    where user_id = ${userId}
      and kind = ${"withdrawal"}
      and status in (${"success"}, ${"processing"})
      and created_at >= ${start}
      and created_at < ${end}
  `;
  return asInt(rows[0]?.total);
}

function overCapMessage(opts: {
  remainingTambala: number;
  capTambala: number;
  supportPhone: string | null;
  atFinalTier: boolean;
}): string {
  if (opts.remainingTambala <= 0) {
    const base =
      `You have reached today’s withdrawal limit of ${formatKwacha(opts.capTambala)}. ` +
      `You can withdraw again after midnight (Malawi time).`;
    if (opts.atFinalTier) {
      const contact = opts.supportPhone
        ? ` To withdraw more than ${formatKwacha(kwachaToTambala(FINAL_DAILY_WITHDRAW_CAP_KWACHA))} in a day, contact support on ${opts.supportPhone}.`
        : ` To withdraw more than the daily limit, contact platform support.`;
      return base + contact;
    }
    return base;
  }
  const base =
    `This withdrawal would exceed today’s limit. You can still withdraw up to ${formatKwacha(opts.remainingTambala)} today ` +
    `(daily limit ${formatKwacha(opts.capTambala)}, resets at midnight Malawi time). ` +
    `If your balance is higher, withdraw the rest tomorrow.`;
  if (opts.atFinalTier) {
    const contact = opts.supportPhone
      ? ` Need more than ${formatKwacha(opts.capTambala)} in one day? Contact support on ${opts.supportPhone}.`
      : ` Need more than the daily limit? Contact platform support.`;
    return base + contact;
  }
  return base;
}

export async function assertWithdrawAllowed(
  sql: Sql,
  opts: {
    userId: string;
    profile: CapProfile;
    amountTambala: number;
  },
): Promise<void> {
  const holdUntil = effectiveHoldUntilMs(opts.profile);
  if (holdUntil > 0) {
    throw new Error(holdMessage(holdUntil));
  }

  const capKwacha = await ensureAutoCapRaise(sql, opts.userId, opts.profile);
  const capTambala = kwachaToTambala(capKwacha);
  const used = await withdrawnTodayTambala(sql, opts.userId);
  const remaining = Math.max(0, capTambala - used);
  const atFinalTier = capKwacha >= FINAL_DAILY_WITHDRAW_CAP_KWACHA;
  const supportPhone = atFinalTier ? await getSupportPhone(sql) : null;

  if (opts.amountTambala > remaining) {
    throw new Error(
      overCapMessage({
        remainingTambala: remaining,
        capTambala,
        supportPhone,
        atFinalTier,
      }),
    );
  }
}

export async function withdrawRoomTambala(
  sql: Sql,
  userId: string,
  profile: CapProfile,
): Promise<{
  holdUntilMs: number;
  capTambala: number;
  usedTambala: number;
  remainingTambala: number;
  ageDays: number;
  supportPhone: string | null;
}> {
  const holdUntilMs = effectiveHoldUntilMs(profile);
  const ageDays = accountAgeDays(profile.created_at);
  const capKwacha = await ensureAutoCapRaise(sql, userId, profile);
  const capTambala = kwachaToTambala(capKwacha);
  const usedTambala = holdUntilMs > 0 ? 0 : await withdrawnTodayTambala(sql, userId);
  const remainingTambala = holdUntilMs > 0 ? 0 : Math.max(0, capTambala - usedTambala);
  const atFinal = capKwacha >= FINAL_DAILY_WITHDRAW_CAP_KWACHA;
  const supportPhone = atFinal ? await getSupportPhone(sql) : null;
  return { holdUntilMs, capTambala, usedTambala, remainingTambala, ageDays, supportPhone };
}
