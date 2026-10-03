import type { Sql } from "@/lib/db";
import { getSql } from "@/lib/db";

export type AuditAction =
  | "sign_in"
  | "sign_in_failed"
  | "pin_ok"
  | "pin_failed"
  | "pin_locked"
  | "pin_reset"
  | "pin_change"
  | "password_change"
  | "phone_change"
  | "deposit_start"
  | "deposit_credited"
  | "withdraw_start"
  | "withdraw_success"
  | "withdraw_failed"
  | "account_delete"
  | "admin_action"
  | "support_phone_set"
  | "session_revoke_others";

export async function writeAudit(
  sql: Sql | null,
  entry: {
    action: AuditAction | string;
    userId?: string | null;
    actorUserId?: string | null;
    detail?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  try {
    const client = sql ?? (await getSql());
    await client`
      insert into audit_log (user_id, actor_user_id, action, detail, ip, user_agent)
      values (
        ${entry.userId ?? null},
        ${entry.actorUserId ?? entry.userId ?? null},
        ${entry.action},
        ${entry.detail ?? null},
        ${entry.ip ?? null},
        ${entry.userAgent ?? null}
      )
    `;
  } catch (err) {
    // Never fail the main operation because audit write failed.
    console.error("[audit]", entry.action, (err as Error).message);
  }
}
