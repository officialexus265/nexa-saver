import type { Sql } from "@/lib/db";
import { env, isProduction } from "@/lib/env.server";
import { getProductionReadiness } from "./production-guards.server";
import { getMoneyPauseStatus } from "./kill-switch.server";
import { getLaunchSettings } from "./launch.server";

export type SecurityCheck = {
  id: string;
  label: string;
  ok: boolean;
  severity: "critical" | "high" | "medium" | "info";
  hint: string;
};

/**
 * Operator-facing security posture snapshot (no secret values).
 */
export async function runSecurityChecklist(sql: Sql): Promise<{
  checks: SecurityCheck[];
  criticalOk: boolean;
  highOk: boolean;
}> {
  const readiness = getProductionReadiness();
  const pause = await getMoneyPauseStatus(sql);
  const launch = await getLaunchSettings(sql);

  let pendingKyc = 0;
  try {
    const r = await sql<{ n: number }>`
      select count(*)::int as n from profiles where kyc_status = ${"pending"}
    `;
    pendingKyc = Number(r[0]?.n ?? 0);
  } catch {
    pendingKyc = 0;
  }

  let stuckPending = 0;
  try {
    const r = await sql<{ n: number }>`
      select count(*)::int as n from transactions
      where status = 'pending' and created_at < now() - interval '15 minutes'
    `;
    stuckPending = Number(r[0]?.n ?? 0);
  } catch {
    stuckPending = 0;
  }

  const checks: SecurityCheck[] = [
    ...readiness.items.map((i) => ({
      id: `env_${i.id}`,
      label: i.label,
      ok: i.ok,
      severity: i.critical ? ("critical" as const) : ("high" as const),
      hint: i.hint,
    })),
    {
      id: "cron_secret",
      label: "CRON_SECRET set (or non-production)",
      ok: !isProduction() || Boolean(env("CRON_SECRET")),
      severity: "high",
      hint: "Protects /api/cron/reconcile from public callers.",
    },
    {
      id: "demo_off",
      label: "Demo payments off in production",
      ok: !isProduction() || env("NEXA_DEMO_PAYMENTS") !== "true",
      severity: "critical",
      hint: "Unset NEXA_DEMO_PAYMENTS in production.",
    },
    {
      id: "smtp",
      label: "SMTP configured (alerts / recovery)",
      ok: Boolean(env("SMTP_HOST") && env("SMTP_FROM")),
      severity: "medium",
      hint: "Needed for passkey recovery, security emails, and admin alerts.",
    },
    {
      id: "money_not_paused_unexpectedly",
      label: "Money movement not fully paused",
      ok: !(pause.depositsPaused && pause.withdrawalsPaused),
      severity: "info",
      hint: pause.depositsPaused || pause.withdrawalsPaused
        ? `Paused: deposits=${pause.depositsPaused} withdrawals=${pause.withdrawalsPaused}. Clear in Ops if unintentional.`
        : "Deposits and withdrawals are available (subject to other gates).",
    },
    {
      id: "beta_caps",
      label: "Beta mode / signup gates intentional",
      ok: true,
      severity: "info",
      hint: `signup=${launch.signupEnabled} beta=${launch.betaMode} depositCap=${launch.betaDepositCapKwacha || "none"}`,
    },
    {
      id: "stuck_tx",
      label: "No stuck pending txs (>15m)",
      ok: stuckPending === 0,
      severity: stuckPending > 0 ? "high" : "info",
      hint: stuckPending > 0 ? `${stuckPending} pending item(s) — review Ops queues.` : "No long-pending rows.",
    },
    {
      id: "kyc_queue",
      label: "KYC queue size",
      ok: pendingKyc < 50,
      severity: "info",
      hint: pendingKyc ? `${pendingKyc} pending KYC review(s).` : "KYC queue clear.",
    },
  ];

  const criticalOk = checks.filter((c) => c.severity === "critical").every((c) => c.ok);
  const highOk = checks.filter((c) => c.severity === "high").every((c) => c.ok);

  return { checks, criticalOk, highOk };
}
