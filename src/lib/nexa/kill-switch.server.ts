import { env } from "@/lib/env.server";
import type { Sql } from "@/lib/db";

const KEYS = {
  deposits: "pause_deposits",
  withdrawals: "pause_withdrawals",
  all: "pause_all",
  note: "pause_note",
  by: "pause_by",
  at: "pause_at",
} as const;

/** Env flags always win (emergency without DB). */
export function depositsPausedEnv(): boolean {
  return env("NEXA_PAUSE_DEPOSITS") === "true" || env("NEXA_PAUSE_ALL") === "true";
}

export function withdrawalsPausedEnv(): boolean {
  return env("NEXA_PAUSE_WITHDRAWALS") === "true" || env("NEXA_PAUSE_ALL") === "true";
}

/** Sync env-only checks (legacy call sites). Prefer async versions with Sql. */
export function depositsPaused(): boolean {
  return depositsPausedEnv();
}

export function withdrawalsPaused(): boolean {
  return withdrawalsPausedEnv();
}

export function assertDepositsAllowed(): void {
  if (depositsPausedEnv()) {
    throw new Error("Deposits are temporarily paused. Please try again later.");
  }
}

export function assertWithdrawalsAllowed(): void {
  if (withdrawalsPausedEnv()) {
    throw new Error("Withdrawals are temporarily paused. Your balance was not touched.");
  }
}

async function readFlag(sql: Sql, key: string): Promise<boolean> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${key} limit 1
    `;
    return rows[0]?.value === "true";
  } catch {
    return false;
  }
}

export async function depositsPausedDb(sql: Sql): Promise<boolean> {
  if (depositsPausedEnv()) return true;
  if (await readFlag(sql, KEYS.all)) return true;
  return readFlag(sql, KEYS.deposits);
}

export async function withdrawalsPausedDb(sql: Sql): Promise<boolean> {
  if (withdrawalsPausedEnv()) return true;
  if (await readFlag(sql, KEYS.all)) return true;
  return readFlag(sql, KEYS.withdrawals);
}

export async function assertDepositsAllowedAsync(sql: Sql): Promise<void> {
  if (await depositsPausedDb(sql)) {
    throw new Error("Deposits are temporarily paused. Please try again later.");
  }
}

export async function assertWithdrawalsAllowedAsync(sql: Sql): Promise<void> {
  if (await withdrawalsPausedDb(sql)) {
    throw new Error("Withdrawals are temporarily paused. Your balance was not touched.");
  }
}

export type MoneyPauseStatus = {
  depositsPaused: boolean;
  withdrawalsPaused: boolean;
  envOverride: boolean;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export async function getMoneyPauseStatus(sql: Sql): Promise<MoneyPauseStatus> {
  const envOverride = depositsPausedEnv() || withdrawalsPausedEnv();
  let note: string | null = null;
  let updatedBy: string | null = null;
  let updatedAt: string | null = null;
  try {
    const rows = await sql<{ key: string; value: string }>`
      select key, value from platform_settings
      where key in (${KEYS.note}, ${KEYS.by}, ${KEYS.at})
    `;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    note = map[KEYS.note] || null;
    updatedBy = map[KEYS.by] || null;
    updatedAt = map[KEYS.at] || null;
  } catch {
    /* */
  }
  return {
    depositsPaused: await depositsPausedDb(sql),
    withdrawalsPaused: await withdrawalsPausedDb(sql),
    envOverride,
    note,
    updatedBy,
    updatedAt,
  };
}

export async function setMoneyPause(
  sql: Sql,
  opts: {
    deposits?: boolean;
    withdrawals?: boolean;
    note?: string;
    actorUserId: string;
  },
): Promise<MoneyPauseStatus> {
  const now = new Date().toISOString();
  async function put(key: string, value: string) {
    await sql`
      insert into platform_settings (key, value, updated_at)
      values (${key}, ${value}, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
  }
  if (opts.deposits != null) await put(KEYS.deposits, opts.deposits ? "true" : "false");
  if (opts.withdrawals != null) await put(KEYS.withdrawals, opts.withdrawals ? "true" : "false");
  if (opts.note != null) await put(KEYS.note, opts.note.slice(0, 300));
  await put(KEYS.by, opts.actorUserId);
  await put(KEYS.at, now);
  return getMoneyPauseStatus(sql);
}
