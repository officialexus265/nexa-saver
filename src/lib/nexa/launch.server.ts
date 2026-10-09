import type { Sql } from "@/lib/db";

const KEYS = {
  signupEnabled: "launch_signup_enabled",
  betaMode: "launch_beta_mode",
  betaDepositCap: "launch_beta_deposit_cap_kwacha",
  incidentNotes: "launch_incident_notes",
  publicBanner: "launch_public_banner",
} as const;

async function read(sql: Sql, key: string): Promise<string | null> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${key} limit 1
    `;
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function write(sql: Sql, key: string, value: string): Promise<void> {
  await sql`
    insert into platform_settings (key, value, updated_at)
    values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export type LaunchSettings = {
  /** When false, new sign-ups are blocked */
  signupEnabled: boolean;
  /** Soft beta: shows banner + optional deposit cap */
  betaMode: boolean;
  /** 0 = no extra cap */
  betaDepositCapKwacha: number;
  /** Short message shown to logged-out users when betaMode */
  publicBanner: string;
  /** Admin-only incident notes / playbook */
  incidentNotes: string;
};

export async function getLaunchSettings(sql: Sql): Promise<LaunchSettings> {
  const signupRaw = await read(sql, KEYS.signupEnabled);
  const betaRaw = await read(sql, KEYS.betaMode);
  const capRaw = await read(sql, KEYS.betaDepositCap);
  const banner = (await read(sql, KEYS.publicBanner)) || "";
  const notes = (await read(sql, KEYS.incidentNotes)) || "";
  const cap = Number(capRaw);
  return {
    signupEnabled: signupRaw !== "false",
    betaMode: betaRaw === "true",
    betaDepositCapKwacha: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0,
    publicBanner:
      banner ||
      (betaRaw === "true"
        ? "Private beta — trusted testers only. Limits may be low while we watch the books."
        : ""),
    incidentNotes: notes,
  };
}

export async function setLaunchSettings(
  sql: Sql,
  patch: Partial<{
    signupEnabled: boolean;
    betaMode: boolean;
    betaDepositCapKwacha: number;
    publicBanner: string;
    incidentNotes: string;
  }>,
): Promise<LaunchSettings> {
  if (patch.signupEnabled != null) await write(sql, KEYS.signupEnabled, patch.signupEnabled ? "true" : "false");
  if (patch.betaMode != null) await write(sql, KEYS.betaMode, patch.betaMode ? "true" : "false");
  if (patch.betaDepositCapKwacha != null) {
    await write(sql, KEYS.betaDepositCap, String(Math.max(0, Math.floor(patch.betaDepositCapKwacha))));
  }
  if (patch.publicBanner != null) await write(sql, KEYS.publicBanner, patch.publicBanner.slice(0, 400));
  if (patch.incidentNotes != null) await write(sql, KEYS.incidentNotes, patch.incidentNotes.slice(0, 8000));
  return getLaunchSettings(sql);
}

export async function assertSignupAllowed(sql: Sql): Promise<void> {
  const s = await getLaunchSettings(sql);
  if (!s.signupEnabled) {
    throw new Error("New sign-ups are temporarily closed. Please try again later or contact support.");
  }
}

/** Returns max allowed deposit in kwacha for beta, or null if no extra cap. */
export async function getBetaDepositCapKwacha(sql: Sql): Promise<number | null> {
  const s = await getLaunchSettings(sql);
  if (!s.betaMode || s.betaDepositCapKwacha <= 0) return null;
  return s.betaDepositCapKwacha;
}

export const DEFAULT_INCIDENT_NOTES = `Incident playbook (edit freely)

1) Pause money if needed: Admin → Ops → Pause deposits / withdrawals.
2) Stuck deposit (user paid, still pending): confirm in PayChangu → Support desk → force credit with reason.
3) Withdrawal sent but not received: check PayChangu payout status + reference; do not double-pay until status is clear.
4) Suspected account takeover: lock account or lock withdrawals; user resets password via email; review sessions.
5) Books mismatch: Ops → Run reconciliation; note the delta; pause if unbalanced until understood.
6) Contact: platform support number in settings / help lines.

After incident: write what happened, what you did, and any fee/refund in the audit note fields.`;
