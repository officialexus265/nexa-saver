import { createFileRoute } from "@tanstack/react-router";
import { parseWebhookPayload, verifyPayment } from "@/lib/nexa/paychangu.server";
import { creditDeposit, getDepositByReference } from "@/lib/nexa/ledger.server";
import { env, isProduction } from "@/lib/env.server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { kwachaToTambala } from "@/lib/nexa/money";

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
            // Do not trust the webhook body alone — re-verify with PayChangu.
            const verified = await verifyPayment(ref);
            if (!verified.ok) {
              return new Response(JSON.stringify({ ok: true, skipped: "not_confirmed" }), {
                status: 200,
                headers: { "content-type": "application/json" },
              });
            }

            const stored = await getDepositByReference(ref);
            if (!stored || stored.kind !== "deposit") {
              // Unknown or non-deposit ref — still 200 so provider does not retry forever.
              return new Response(JSON.stringify({ ok: true, skipped: "unknown_ref" }), {
                status: 200,
                headers: { "content-type": "application/json" },
              });
            }

            // Amount from PayChangu is in kwacha; stored gross is tambala.
            const verifiedTambala = kwachaToTambala(verified.amount);
            if (verifiedTambala > 0 && verifiedTambala !== Number(stored.gross_tambala)) {
              console.error(
                `[webhook] amount mismatch ref=${ref} stored=${stored.gross_tambala} verified=${verifiedTambala}`,
              );
              return new Response(JSON.stringify({ ok: false, error: "amount_mismatch" }), {
                status: 200,
                headers: { "content-type": "application/json" },
              });
            }

            await creditDeposit(ref);
          } catch (err) {
            // unknown, already posted, or transient — still 200 so PayChangu does not retry forever
            const { reportError } = await import("@/lib/nexa/monitoring.server");
            await reportError(err, { where: "webhook.credit", ref });
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
