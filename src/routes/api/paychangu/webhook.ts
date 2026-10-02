import { createFileRoute } from "@tanstack/react-router";
import { parseWebhookPayload } from "@/lib/nexa/paychangu.server";
import { creditDeposit } from "@/lib/nexa/ledger.server";
import { env, isProduction } from "@/lib/env.server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/paychangu/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const secret = env("PAYCHANGU_WEBHOOK_SECRET");
        if (!secret && isProduction()) {
          // Never accept unsigned payment callbacks in production.
          return new Response("webhook secret not configured", { status: 503 });
        }
        if (secret) {
          const signature = request.headers.get("signature") ?? request.headers.get("Signature") ?? "";
          const computed = createHmac("sha256", secret).update(raw).digest("hex");
          const a = Buffer.from(signature);
          const b = Buffer.from(computed);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("invalid signature", { status: 401 });
          }
        }
        let body: unknown = {};
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const payload = parseWebhookPayload(body);
        const ref = payload.txRef ?? payload.chargeId;
        if (ref && (payload.status === "success" || payload.status === "successful")) {
          try {
            await creditDeposit(ref);
          } catch {
            /* unknown or already posted — still 200 so PayChangu does not retry forever */
          }
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
