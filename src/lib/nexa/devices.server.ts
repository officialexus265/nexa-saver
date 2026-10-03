import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";
import { getRequest } from "@tanstack/react-start/server";
import { sendNewDeviceAlert } from "./mail.server";
import { writeAudit } from "./audit.server";

function clientIp(headers: Headers): string {
  const xf = headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "";
  return headers.get("x-real-ip")?.trim() || "";
}

function fingerprint(userAgent: string, ip: string): string {
  // Coarse: UA family + /24 of IPv4 so small DHCP changes don't spam alerts.
  const ua = userAgent.slice(0, 180);
  let net = ip;
  const m = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (m) net = `${m[1]}.0/24`;
  return createHash("sha256").update(`${ua}|${net}`).digest("hex").slice(0, 32);
}

/**
 * Record this request's device. On first sighting for the user, email them (if SMTP is set).
 * Safe to call on every heartbeat / getMe — updates last_seen only after the first alert.
 */
export async function noteDeviceAccess(
  sql: Sql,
  opts: { userId: string; email: string; firstName: string },
): Promise<{ isNew: boolean }> {
  try {
    const request = getRequest();
    const headers = request.headers;
    const userAgent = headers.get("user-agent") ?? "";
    const ip = clientIp(headers);
    const fp = fingerprint(userAgent, ip);

    const existing = await sql<{ id: number }>`
      select id from known_devices
      where user_id = ${opts.userId} and fingerprint = ${fp}
      limit 1
    `;

    if (existing[0]) {
      await sql`
        update known_devices
        set last_seen_at = now(), last_ip = ${ip || null}, user_agent = ${userAgent || null}
        where id = ${existing[0].id}
      `;
      return { isNew: false };
    }

    // First time this fingerprint is seen for this user.
    const prior = await sql<{ n: number }>`
      select count(*)::int as n from known_devices where user_id = ${opts.userId}
    `;
    const isFirstEverDevice = (prior[0]?.n ?? 0) === 0;

    await sql`
      insert into known_devices (user_id, fingerprint, user_agent, last_ip)
      values (${opts.userId}, ${fp}, ${userAgent || null}, ${ip || null})
      on conflict (user_id, fingerprint) do update
        set last_seen_at = now(), last_ip = excluded.last_ip, user_agent = excluded.user_agent
    `;

    // Don't alert on the very first device (normal signup / first login).
    if (!isFirstEverDevice) {
      await writeAudit(sql, {
        action: "new_device",
        userId: opts.userId,
        detail: `ip=${ip} ua=${userAgent.slice(0, 80)}`,
        ip,
        userAgent,
      });
      void sendNewDeviceAlert({
        to: opts.email,
        firstName: opts.firstName,
        userAgent,
        ip,
        when: new Date(),
      });
    }

    return { isNew: !isFirstEverDevice };
  } catch (err) {
    console.error("[devices]", (err as Error).message);
    return { isNew: false };
  }
}
