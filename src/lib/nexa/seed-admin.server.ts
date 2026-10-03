import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { env, isProduction } from "@/lib/env.server";
import { ADMIN_EMAIL, ADMIN_USER_ID, ADMIN_USERNAME } from "./constants";
import { hashSecret, normalizeAnswer } from "./crypto";

const globalRef = globalThis as typeof globalThis & {
  __nexaAdminSeeded__?: Promise<void>;
};

export function ensureAdmin(): Promise<void> {
  globalRef.__nexaAdminSeeded__ ??= seedAdmin().catch((err) => {
    globalRef.__nexaAdminSeeded__ = undefined;
    throw err;
  });
  return globalRef.__nexaAdminSeeded__;
}

/**
 * Initial admin password:
 *   1. ADMIN_INITIAL_PASSWORD env (preferred — never a known default)
 *   2. In non-production only: fall back to "admin" with must_change_password
 *   3. In production with no env: skip seeding (safer than a public default)
 */
function resolveInitialPassword(): string | null {
  const fromEnv = env("ADMIN_INITIAL_PASSWORD");
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  if (isProduction()) {
    if (fromEnv) {
      console.warn("[admin] ADMIN_INITIAL_PASSWORD is set but shorter than 8 characters — ignoring.");
    }
    return null;
  }
  return "admin";
}

async function seedAdmin(): Promise<void> {
  const sql = await getSql();
  const existing = await sql<{ user_id: string }>`
    select user_id from profiles where role = 'admin' limit 1
  `;
  if (existing.length) return;

  const password = resolveInitialPassword();
  if (!password) {
    console.warn(
      "[admin] No admin account created. Set ADMIN_INITIAL_PASSWORD (min 8 chars) to seed the first admin.",
    );
    return;
  }

  const passwordHash = await hashPassword(password);
  const pinHash = await hashSecret("0000");
  const answerHash = await hashSecret(normalizeAnswer("nexa"));
  const userId = ADMIN_USER_ID;
  const accountId = `${userId}-credential`;
  // Force password change unless a strong env password was provided in production-like setup.
  const mustChange = password === "admin" || !env("ADMIN_INITIAL_PASSWORD");

  await sql`
    insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    values (${userId}, ${"NEXA Admin"}, ${ADMIN_EMAIL}, ${true}, now(), now())
    on conflict ("id") do nothing
  `;

  await sql`
    insert into "account" (
      "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
    )
    values (
      ${accountId}, ${userId}, ${"credential"}, ${userId}, ${passwordHash}, now(), now()
    )
    on conflict ("id") do nothing
  `;

  await sql`
    insert into profiles (
      user_id, first_name, last_name, email, phone, username, date_of_birth,
      pin_hash, security_question, security_answer_hash, role, must_change_password,
      login_identifier_pref
    )
    values (
      ${userId}, ${"Platform"}, ${"Admin"}, ${ADMIN_EMAIL}, ${"0990000000"},
      ${ADMIN_USERNAME}, ${"1990-01-01"}, ${pinHash},
      ${"What was the name of your first pet?"}, ${answerHash}, ${"admin"},
      ${mustChange}, ${"username"}
    )
    on conflict (user_id) do nothing
  `;

  await sql`
    insert into wallets (user_id)
    values (${userId})
    on conflict (user_id) do nothing
  `;
}
