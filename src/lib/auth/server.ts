/**
 * Better Auth (server-only) — email + password sessions stored in Neon Postgres.
 *
 * Environment:
 *   DATABASE_URL         Neon pooled connection string (required)
 *   BETTER_AUTH_SECRET   long random string, e.g. `openssl rand -base64 32` (required in production)
 *   BETTER_AUTH_URL      public origin, e.g. https://nexa-saver.vercel.app (recommended)
 *
 * On Vercel, if BETTER_AUTH_URL is not set we fall back to Vercel's own URL variables.
 * Never import this from client code — use `@/lib/auth/client` there.
 */
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Pool } from "pg";
import { env, isProduction } from "../env.server";
import { SESSION_INACTIVITY_MS } from "../nexa/constants";

function resolveBaseURL(): string {
  const explicit = env("BETTER_AUTH_URL");
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelProd = env("VERCEL_PROJECT_PRODUCTION_URL");
  const vercelUrl = env("VERCEL_URL");
  if (env("VERCEL_ENV") === "production" && vercelProd) return `https://${vercelProd}`;
  if (vercelUrl) return `https://${vercelUrl}`;
  return "http://localhost:3000";
}

function resolveSecret(): string {
  const secret = env("BETTER_AUTH_SECRET");
  if (secret) return secret;
  if (isProduction()) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and add it to your environment.",
    );
  }
  console.warn("[auth] BETTER_AUTH_SECRET not set — using an insecure development secret.");
  return "nexa-saver-insecure-development-secret-change-me";
}

const baseURL = resolveBaseURL();

const trustedOrigins = new Set<string>([baseURL]);
for (const host of [env("VERCEL_URL"), env("VERCEL_BRANCH_URL"), env("VERCEL_PROJECT_PRODUCTION_URL")]) {
  if (host) trustedOrigins.add(`https://${host}`);
}
if (!isProduction()) {
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:4173"]) {
    trustedOrigins.add(origin);
  }
}

const SESSION_SECONDS = Math.ceil(SESSION_INACTIVITY_MS / 1000) + 5 * 24 * 60 * 60; // 30 days + grace

export const auth = betterAuth({
  baseURL,
  secret: resolveSecret(),
  database: new Pool({ connectionString: env("DATABASE_URL"), max: 3, idleTimeoutMillis: 10_000 }),
  trustedOrigins: [...trustedOrigins],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: false, // session allowed; money ops check emailVerified
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }: { user: { name?: string | null; email: string }; url: string }) => {
      const { sendMail } = await import("../nexa/mail.server");
      const { APP_NAME } = await import("../nexa/constants");
      const subject = `${APP_NAME}: verify your email`;
      const lines = [
        `Hi ${user.name || "there"},`,
        "",
        `Confirm your email for ${APP_NAME} by opening this link:`,
        url,
        "",
        "If you did not create an account, ignore this email.",
        "",
        `— ${APP_NAME}`,
      ];
      const text = lines.join(String.fromCharCode(10));
      const html =
        '<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;padding:24px">' +
        `<p>Hi ${user.name || "there"},</p>` +
        `<p>Confirm your email for ${APP_NAME}.</p>` +
        `<p><a href="${url}" style="display:inline-block;background:#3dcf8e;color:#062016;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Verify email</a></p>` +
        `<p style="font-size:12px;color:#666;word-break:break-all">${url}</p>` +
        "</body></html>";
      await sendMail({ to: user.email, subject, text, html });
    },
  },
  // The session cookie lasts longer than the 30-day inactivity rule so that rule
  // (enforced server-side in `touchSession`) is what actually ends a session.
  // The expiry is pushed forward at most once a day while the user is active.
  session: { expiresIn: SESSION_SECONDS, updateAge: 24 * 60 * 60 },
  advanced: {
    useSecureCookies: isProduction(),
    defaultCookieAttributes: { sameSite: "lax", path: "/" },
  },
  // Must be last so it can forward Set-Cookie into TanStack Start responses.
  plugins: [tanstackStartCookies()],
});
