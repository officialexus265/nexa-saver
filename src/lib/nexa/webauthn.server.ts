import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { randomBytes } from "node:crypto";
import type { Sql } from "@/lib/db";
import { env, isProduction } from "@/lib/env.server";

function rpConfig() {
  const base =
    env("BETTER_AUTH_URL") ||
    (env("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}` : null) ||
    (env("VERCEL_URL") ? `https://${env("VERCEL_URL")}` : null) ||
    "http://localhost:3000";
  const url = new URL(base);
  const rpID = url.hostname === "localhost" ? "localhost" : url.hostname;
  const origin = url.origin;
  return { rpID, origin, rpName: "NEXA-SAVER Admin" };
}

async function assertAdmin(sql: Sql, userId: string) {
  const rows = await sql<{ role: string }>`select role from profiles where user_id = ${userId} limit 1`;
  if (!rows.length || rows[0].role !== "admin") throw new Error("Only admin can use security keys.");
}

async function storeChallenge(sql: Sql, userId: string, challenge: string, purpose: string) {
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await sql`
    insert into admin_webauthn_challenges (user_id, challenge, purpose, expires_at)
    values (${userId}, ${challenge}, ${purpose}, ${expires})
    on conflict (user_id) do update set
      challenge = excluded.challenge,
      purpose = excluded.purpose,
      expires_at = excluded.expires_at
  `;
}

async function takeChallenge(sql: Sql, userId: string, purpose: string): Promise<string> {
  const rows = await sql<{ challenge: string; expires_at: Date | string }>`
    select challenge, expires_at from admin_webauthn_challenges
    where user_id = ${userId} and purpose = ${purpose} limit 1
  `;
  if (!rows.length) throw new Error("Security key challenge expired. Try again.");
  if (new Date(rows[0].expires_at).getTime() < Date.now()) {
    throw new Error("Security key challenge expired. Try again.");
  }
  await sql`delete from admin_webauthn_challenges where user_id = ${userId}`;
  return rows[0].challenge;
}

function b64urlToBuf(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

function bufToB64url(buf: Uint8Array | Buffer): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function listWebAuthnCredentials(sql: Sql, userId: string) {
  await assertAdmin(sql, userId);
  const rows = await sql<{
    id: string;
    nickname: string | null;
    device_type: string | null;
    backed_up: boolean;
    created_at: unknown;
    last_used_at: unknown;
  }>`
    select id, nickname, device_type, backed_up, created_at, last_used_at
    from admin_webauthn_credentials where user_id = ${userId}
    order by created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    nickname: r.nickname || "Security key",
    deviceType: r.device_type,
    backedUp: Boolean(r.backed_up),
    createdAt: String(r.created_at),
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
  }));
}

export async function getRegistrationOptions(sql: Sql, userId: string, userName: string) {
  await assertAdmin(sql, userId);
  const { rpID, rpName } = rpConfig();
  const existing = await sql<{ credential_id: string; transports: string | null }>`
    select credential_id, transports from admin_webauthn_credentials where user_id = ${userId}
  `;
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName,
    userDisplayName: "NEXA Admin",
    userID: new TextEncoder().encode(userId.slice(0, 32).padEnd(16, "0")),
    attestationType: "none",
    excludeCredentials: existing.map((e) => ({
      id: e.credential_id,
      transports: e.transports ? (JSON.parse(e.transports) as AuthenticatorTransportFuture[]) : undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  await storeChallenge(sql, userId, options.challenge, "register");
  return options;
}

export async function verifyRegistration(
  sql: Sql,
  userId: string,
  response: unknown,
  nickname?: string,
) {
  await assertAdmin(sql, userId);
  const { rpID, origin } = rpConfig();
  const expectedChallenge = await takeChallenge(sql, userId, "register");
  const verification = await verifyRegistrationResponse({
    response: response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Security key registration failed.");
  }
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const id = bufToB64url(randomId());
  const credentialId =
    typeof credential.id === "string" ? credential.id : bufToB64url(credential.id as Uint8Array);
  const publicKey = bufToB64url(
    credential.publicKey instanceof Uint8Array
      ? credential.publicKey
      : new Uint8Array(credential.publicKey as ArrayBuffer),
  );
  await sql`
    insert into admin_webauthn_credentials (
      id, user_id, credential_id, public_key, counter, device_type, backed_up, transports, nickname
    ) values (
      ${id},
      ${userId},
      ${credentialId},
      ${publicKey},
      ${credential.counter ?? 0},
      ${credentialDeviceType ?? null},
      ${Boolean(credentialBackedUp)},
      ${JSON.stringify((response as { response?: { transports?: string[] } })?.response?.transports ?? [])},
      ${(nickname || "Security key").slice(0, 80)}
    )
  `;
  return { ok: true as const, id };
}

function randomId(): Uint8Array {
  return new Uint8Array(randomBytes(16));
}

export async function getAuthenticationOptions(sql: Sql, userId: string) {
  await assertAdmin(sql, userId);
  const { rpID } = rpConfig();
  const existing = await sql<{ credential_id: string; transports: string | null }>`
    select credential_id, transports from admin_webauthn_credentials where user_id = ${userId}
  `;
  if (!existing.length) throw new Error("No security key registered. Add one under Admin → 2FA.");
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: existing.map((e) => ({
      id: e.credential_id,
      transports: e.transports ? (JSON.parse(e.transports) as AuthenticatorTransportFuture[]) : undefined,
    })),
    userVerification: "preferred",
  });
  await storeChallenge(sql, userId, options.challenge, "auth");
  return options;
}

export async function verifyAuthentication(sql: Sql, userId: string, response: unknown) {
  await assertAdmin(sql, userId);
  const { rpID, origin } = rpConfig();
  const expectedChallenge = await takeChallenge(sql, userId, "auth");
  const credId =
    typeof (response as { id?: string }).id === "string"
      ? (response as { id: string }).id
      : null;
  if (!credId) throw new Error("Invalid security key response.");
  const rows = await sql<{
    credential_id: string;
    public_key: string;
    counter: number;
    transports: string | null;
  }>`
    select credential_id, public_key, counter, transports
    from admin_webauthn_credentials
    where user_id = ${userId} and credential_id = ${credId}
    limit 1
  `;
  if (!rows.length) throw new Error("Unknown security key.");
  const row = rows[0];
  const verification = await verifyAuthenticationResponse({
    response: response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: row.credential_id,
      publicKey: b64urlToBuf(row.public_key),
      counter: Number(row.counter),
      transports: row.transports
        ? (JSON.parse(row.transports) as AuthenticatorTransportFuture[])
        : undefined,
    },
    requireUserVerification: false,
  });
  if (!verification.verified) throw new Error("Security key verification failed.");
  const newCounter = verification.authenticationInfo.newCounter;
  await sql`
    update admin_webauthn_credentials
    set counter = ${newCounter}, last_used_at = now()
    where user_id = ${userId} and credential_id = ${credId}
  `;
  return { ok: true as const };
}

export async function deleteWebAuthnCredential(sql: Sql, userId: string, id: string) {
  await assertAdmin(sql, userId);
  await sql`delete from admin_webauthn_credentials where id = ${id} and user_id = ${userId}`;
}

export async function hasWebAuthn(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from admin_webauthn_credentials where user_id = ${userId}
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Session needs 2FA elevation if TOTP is enabled OR at least one passkey is registered.
 */
export async function adminNeedsSecondFactor(sql: Sql, userId: string): Promise<{
  needs: boolean;
  totpEnabled: boolean;
  hasPasskey: boolean;
}> {
  const totp = await sql<{ enabled: boolean }>`
    select coalesce(admin_totp_enabled, false) as enabled from profiles where user_id = ${userId} limit 1
  `;
  const totpEnabled = Boolean(totp[0]?.enabled);
  const passkey = await hasWebAuthn(sql, userId);
  return {
    needs: totpEnabled || passkey,
    totpEnabled,
    hasPasskey: passkey,
  };
}
