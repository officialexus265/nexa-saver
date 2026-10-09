import type { Sql } from "@/lib/db";
import {
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  openSecret,
  otpauthUri,
  qrImageUrl,
  sealSecret,
  verifyBackupCode,
  verifyTotpCode,
} from "./totp.server";

const ELEVATION_HOURS = 12;

export async function getAdminTotpStatus(sql: Sql, userId: string) {
  const rows = await sql<{
    role: string;
    admin_totp_enabled: boolean;
    admin_totp_secret: string | null;
  }>`
    select role, coalesce(admin_totp_enabled, false) as admin_totp_enabled, admin_totp_secret
    from profiles where user_id = ${userId} limit 1
  `;
  if (!rows.length || rows[0].role !== "admin") {
    return { isAdmin: false, enabled: false, configured: false };
  }
  return {
    isAdmin: true,
    enabled: Boolean(rows[0].admin_totp_enabled),
    configured: Boolean(rows[0].admin_totp_secret && rows[0].admin_totp_enabled),
  };
}

export async function beginTotpSetup(sql: Sql, userId: string, accountLabel: string) {
  const status = await getAdminTotpStatus(sql, userId);
  if (!status.isAdmin) throw new Error("Only admin can set up 2FA.");
  if (status.enabled) throw new Error("2FA is already enabled. Disable it first to re-enroll.");

  const secret = generateTotpSecret();
  const sealed = await sealSecret(secret);
  await sql`
    update profiles
    set admin_totp_pending_secret = ${sealed}, updated_at = now()
    where user_id = ${userId}
  `;
  const uri = otpauthUri(secret, accountLabel);
  return { secret, otpauthUri: uri, qrUrl: qrImageUrl(uri) };
}

export async function confirmTotpSetup(sql: Sql, userId: string, code: string) {
  const rows = await sql<{ admin_totp_pending_secret: string | null }>`
    select admin_totp_pending_secret from profiles where user_id = ${userId} and role = ${"admin"} limit 1
  `;
  if (!rows[0]?.admin_totp_pending_secret) throw new Error("Start 2FA setup first.");
  const plain = await openSecret(rows[0].admin_totp_pending_secret);
  if (!verifyTotpCode(plain, code)) throw new Error("Invalid authenticator code. Try again.");

  const backups = generateBackupCodes(10);
  const hashes: string[] = [];
  for (const c of backups) hashes.push(await hashBackupCode(c));

  await sql`
    update profiles
    set admin_totp_secret = ${rows[0].admin_totp_pending_secret},
        admin_totp_pending_secret = null,
        admin_totp_enabled = true,
        admin_totp_backup_hashes = ${JSON.stringify(hashes)},
        updated_at = now()
    where user_id = ${userId}
  `;
  return { backupCodes: backups };
}

export async function disableTotp(sql: Sql, userId: string, code: string) {
  await assertTotpOrBackup(sql, userId, code);
  await sql`
    update profiles
    set admin_totp_enabled = false,
        admin_totp_secret = null,
        admin_totp_pending_secret = null,
        admin_totp_backup_hashes = null,
        updated_at = now()
    where user_id = ${userId}
  `;
  await sql`delete from admin_totp_ok where user_id = ${userId}`;
}

async function assertTotpOrBackup(sql: Sql, userId: string, code: string): Promise<"totp" | "backup"> {
  const rows = await sql<{
    admin_totp_secret: string | null;
    admin_totp_enabled: boolean;
    admin_totp_backup_hashes: string | null;
  }>`
    select admin_totp_secret, coalesce(admin_totp_enabled, false) as admin_totp_enabled, admin_totp_backup_hashes
    from profiles where user_id = ${userId} and role = ${"admin"} limit 1
  `;
  if (!rows[0]?.admin_totp_enabled || !rows[0].admin_totp_secret) {
    throw new Error("Admin 2FA is not enabled.");
  }
  const plain = await openSecret(rows[0].admin_totp_secret);
  if (verifyTotpCode(plain, code)) return "totp";

  // Backup codes
  let hashes: string[] = [];
  try {
    hashes = JSON.parse(rows[0].admin_totp_backup_hashes || "[]") as string[];
  } catch {
    hashes = [];
  }
  for (let i = 0; i < hashes.length; i++) {
    if (await verifyBackupCode(code, hashes[i]!)) {
      hashes.splice(i, 1);
      await sql`
        update profiles set admin_totp_backup_hashes = ${JSON.stringify(hashes)}, updated_at = now()
        where user_id = ${userId}
      `;
      return "backup";
    }
  }
  throw new Error("Invalid authenticator or backup code.");
}

export async function markTotpVerified(sql: Sql, userId: string, sessionToken: string) {
  const expires = new Date(Date.now() + ELEVATION_HOURS * 60 * 60 * 1000);
  await sql`
    insert into admin_totp_ok (session_token, user_id, verified_at, expires_at)
    values (${sessionToken}, ${userId}, now(), ${expires.toISOString()})
    on conflict (session_token) do update set
      verified_at = now(),
      expires_at = excluded.expires_at
  `;
  // prune old
  await sql`delete from admin_totp_ok where expires_at < now()`;
}

export async function isTotpElevated(sql: Sql, userId: string, sessionToken: string | null): Promise<boolean> {
  if (!sessionToken) return false;
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from admin_totp_ok
    where session_token = ${sessionToken}
      and user_id = ${userId}
      and expires_at > now()
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function verifyAndElevate(
  sql: Sql,
  userId: string,
  sessionToken: string,
  code: string,
): Promise<void> {
  await assertTotpOrBackup(sql, userId, code);
  await markTotpVerified(sql, userId, sessionToken);
}

/**
 * When 2FA is enabled for this admin, require a recent TOTP elevation for this session.
 * When 2FA is not enabled, allow (banner encourages enroll) — enrollment is mandatory in production via separate check optional later.
 */
export async function requireAdminTotpElevation(
  sql: Sql,
  userId: string,
  sessionToken: string | null,
): Promise<void> {
  const status = await getAdminTotpStatus(sql, userId);
  if (!status.isAdmin) throw new Error("Forbidden");
  let needs = status.enabled;
  try {
    const { hasWebAuthn } = await import("./webauthn.server");
    if (await hasWebAuthn(sql, userId)) needs = true;
  } catch {
    /* table may not exist yet */
  }
  if (!needs) return;
  if (await isTotpElevated(sql, userId, sessionToken)) return;
  throw new Error("Admin 2FA required. Use your authenticator code or security key.");
}
