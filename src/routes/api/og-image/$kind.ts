import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

/**
 * Serves OG images stored by admin upload (Neon platform_settings).
 * Paths: /api/og-image/share  and  /api/og-image/referral
 * Falls back to /og.jpg when nothing uploaded.
 */
export const Route = createFileRoute("/api/og-image/$kind")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const kind = params.kind === "referral" ? "referral" : "share";
        const dataKey = kind === "referral" ? "og_referral_image_data" : "og_share_image_data";
        const typeKey = kind === "referral" ? "og_referral_image_type" : "og_share_image_type";

        try {
          const sql = await getSql();
          const rows = await sql<{ key: string; value: string }>`
            select key, value from platform_settings
            where key in (${dataKey}, ${typeKey})
          `;
          const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
          const b64 = map[dataKey];
          if (b64) {
            const mime = map[typeKey] || "image/jpeg";
            const buf = Buffer.from(b64, "base64");
            return new Response(buf, {
              status: 200,
              headers: {
                "Content-Type": mime,
                "Cache-Control": "public, max-age=3600",
                "Content-Length": String(buf.length),
              },
            });
          }
        } catch {
          /* fall through */
        }

        const origin = new URL(request.url).origin;
        return Response.redirect(`${origin}/og.jpg`, 302);
      },
    },
  },
});
