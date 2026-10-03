import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "@/lib/db";
import { env } from "@/lib/env.server";

export type SecurityAction = "new_device" | "phone_change" | "pin_change" | "password_reset";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function siteOrigin(): string {
  const raw = (env("BETTER_AUTH_URL") || env("SITE_URL") || "").trim().replace(/\/+$/, "");
  if (!raw) return "https://nexa-saver.vercel.app";
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

/** Create a one-time link token (raw returned once for the email; only hash is stored). */
export async function issueSecurityToken(
  sql: Sql,
  opts: {
    userId: string;
    action: SecurityAction;
    payload?: Record<string, unknown>;
    ttlHours?: number;
  },
): Promise<{ rawToken: string; url: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const hours = opts.ttlHours ?? 24;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  await sql`
    insert into security_action_tokens (token_hash, user_id, action, payload, expires_at)
    values (
      ${tokenHash},
      ${opts.userId},
      ${opts.action},
      ${JSON.stringify(opts.payload ?? {})}::jsonb,
      ${expiresAt}
    )
  `;
  const path = opts.action === "password_reset" ? "/reset-password" : "/secure";
  const url = `${siteOrigin()}${path}?token=${encodeURIComponent(rawToken)}`;
  return { rawToken, url, expiresAt };
}

export type SecurityTokenRow = {
  id: number;
  user_id: string;
  action: SecurityAction;
  payload: Record<string, unknown>;
  expires_at: Date;
  used_at: Date | null;
};

export async function loadValidToken(sql: Sql, rawToken: string): Promise<SecurityTokenRow | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const tokenHash = hashToken(rawToken);
  const rows = await sql<SecurityTokenRow>`
    select id, user_id, action, payload, expires_at, used_at
    from security_action_tokens
    where token_hash = ${tokenHash}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  const payload =
    typeof row.payload === "object" && row.payload !== null ? (row.payload as Record<string, unknown>) : {};
  return { ...row, payload, action: row.action as SecurityAction };
}

export async function consumeToken(sql: Sql, id: number): Promise<void> {
  await sql`update security_action_tokens set used_at = now() where id = ${id} and used_at is null`;
}
