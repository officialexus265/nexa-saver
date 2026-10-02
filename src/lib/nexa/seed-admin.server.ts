import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
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

async function seedAdmin(): Promise<void> {
  const sql = await getSql();
  const existing = await sql<{ user_id: string }>`
    select user_id from profiles where role = 'admin' limit 1
  `;
  if (existing.length) return;

  const passwordHash = await hashPassword("admin");
  const pinHash = await hashSecret("0000");
  const answerHash = await hashSecret(normalizeAnswer("nexa"));
  const userId = ADMIN_USER_ID;
  const accountId = `${userId}-credential`;

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
      ${true}, ${"username"}
    )
    on conflict (user_id) do nothing
  `;

  await sql`
    insert into wallets (user_id)
    values (${userId})
    on conflict (user_id) do nothing
  `;
}
