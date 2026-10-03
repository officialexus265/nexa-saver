import { createFileRoute } from "@tanstack/react-router";
import { env, isProduction } from "@/lib/env.server";
import { runReconciliation } from "@/lib/nexa/reconcile.server";
import { timingSafeEqual } from "node:crypto";

/**
 * Daily reconciliation endpoint.
 * Secure with CRON_SECRET: Authorization: Bearer <CRON_SECRET>
 * Or Vercel Cron sends the secret automatically when configured.
 */
export const Route = createFileRoute("/api/cron/reconcile")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request): Promise<Response> {
  const secret = env("CRON_SECRET");
  if (isProduction() && !secret) {
    return new Response("cron secret not configured", { status: 503 });
  }
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    const a = Buffer.from(auth);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  try {
    const report = await runReconciliation();
    const status = report.balanced && report.pendingStuck === 0 ? 200 : 209;
    return new Response(JSON.stringify(report), {
      status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[cron/reconcile]", err);
    return new Response(JSON.stringify({ error: String((err as Error).message) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
