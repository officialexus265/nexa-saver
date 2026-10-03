import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";
import { getRequest } from "@tanstack/react-start/server";
import { sendSecurityAlertEmail } from "./mail.server";
import { writeAudit } from "./audit.server";
import { issueSecurityToken } from "./security-tokens.server";

function clientIp(headers: Headers): string {
  const xf = headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "";
  return headers.get("x-real-ip")?.trim() || "";
}

function fingerprint(userAgent: string, ip: string): string {
  const ua = userAgent.slice(0, 180);
  let net = ip;
  const m = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (m) net = `${m[1]}.0/24`;
  return createHash("sha256").update(`${ua}|${net}`).digest("hex").slice(0, 32);
}

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

    if (!isFirstEverDevice) {
      const { url } = await issueSecurityToken(sql, {
        userId: opts.userId,
        action: "new_device",
        payload: { ip, userAgent: userAgent.slice(0, 120) },
      });
      await writeAudit(sql, {
        action: "new_device",
        userId: opts.userId,
        detail: `ip=${ip} ua=${userAgent.slice(0, 80)}`,
        ip,
        userAgent,
      });
      void sendSecurityAlertEmail({
        to: opts.email,
        firstName: opts.firstName,
        kind: "new_device",
        secureUrl: url,
        detailLines: [
          `When: ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Blantyre" })} (Malawi time)`,
          `IP: ${ip || "unknown"}`,
          `Device: ${userAgent.slice(0, 140) || "unknown"}`,
        ],
      });
    }

    return { isNew: !isFirstEverDevice };
  } catch (err) {
    console.error("[devices]", (err as Error).message);
    return { isNew: false };
  }
}
