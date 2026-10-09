import { env, isProduction } from "@/lib/env.server";

export type ReadinessItem = {
  id: string;
  label: string;
  ok: boolean;
  /** Shown when not ok — what the operator should do */
  hint: string;
  /** If true, money movement must block when this fails in production */
  critical: boolean;
};

function hasEnv(key: string): boolean {
  return Boolean(env(key));
}

/**
 * Snapshot of production money-path readiness (safe to show to admin — no secret values).
 */
export function getProductionReadiness(): {
  isProduction: boolean;
  items: ReadinessItem[];
  allCriticalOk: boolean;
} {
  const prod = isProduction();
  const pinPepper = hasEnv("NEXA_PIN_PEPPER");
  const authSecret = hasEnv("BETTER_AUTH_SECRET");
  const paychanguKey =
    hasEnv("PAYCHANGU_SECRET_KEY");
  const webhookSecret = hasEnv("PAYCHANGU_WEBHOOK_SECRET");
  const database = hasEnv("DATABASE_URL");
  const demoFlag = env("NEXA_DEMO_PAYMENTS") === "true";

  const items: ReadinessItem[] = [
    {
      id: "database",
      label: "DATABASE_URL",
      ok: database,
      hint: "Set the Neon connection string in Vercel env.",
      critical: true,
    },
    {
      id: "auth_secret",
      label: "BETTER_AUTH_SECRET",
      ok: authSecret,
      hint: "Set a long random secret (openssl rand -base64 32).",
      critical: true,
    },
    {
      id: "pin_pepper",
      label: "NEXA_PIN_PEPPER",
      ok: pinPepper,
      hint: "Set a server-only pepper so PINs stay protected if the DB leaks.",
      critical: true,
    },
    {
      id: "paychangu",
      label: "PayChangu API key",
      ok: paychanguKey,
      hint: "Set PAYCHANGU_SECRET_KEY (or PAYCHANGU_API_KEY) for live payments.",
      critical: true,
    },
    {
      id: "webhook_secret",
      label: "PAYCHANGU_WEBHOOK_SECRET",
      ok: webhookSecret,
      hint: "Required so payment webhooks are signed and trusted.",
      critical: true,
    },
    {
      id: "demo_off",
      label: "Demo payments off in production",
      ok: !prod || !demoFlag,
      hint: "Unset NEXA_DEMO_PAYMENTS in production (or set to false).",
      critical: true,
    },
  ];

  const allCriticalOk = items.filter((i) => i.critical).every((i) => i.ok);

  return { isProduction: prod, items, allCriticalOk };
}

/**
 * Call at the start of deposit / withdraw / send (and similar) in production.
 * No-ops outside production so local/demo can still run.
 */
export function assertMoneyInfraReady(action: string): void {
  if (!isProduction()) return;
  const { items, allCriticalOk } = getProductionReadiness();
  if (allCriticalOk) return;
  const missing = items.filter((i) => i.critical && !i.ok).map((i) => i.label);
  throw new Error(
    `${action} is blocked until production config is complete. Missing or unsafe: ${missing.join(", ")}. Fix env in Vercel, then retry.`,
  );
}
