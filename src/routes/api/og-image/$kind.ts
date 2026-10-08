import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

/**
 * Single platform OG image (admin upload).
 * /api/og-image/share | /api/og-image/referral | /api/og-image/default
 * All serve the same stored image; falls back to /og.jpg
 */
export const Route = createFileRoute("/api/og-image/$kind")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const sql = await getSql();
          const rows = await sql<{ key: string; value: string }>`
            select key, value from platform_settings
            where key in (
              ${"og_platform_image_data"},
              ${"og_platform_image_type"},
              ${"og_share_image_data"},
              ${"og_share_image_type"},
              ${"og_referral_image_data"},
              ${"og_referral_image_type"}
            )
          `;
          const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
          const b64 =
            map.og_platform_image_data || map.og_share_image_data || map.og_referral_image_data || "";
          const mime =
            map.og_platform_image_type ||
            map.og_share_image_type ||
            map.og_referral_image_type ||
            "image/jpeg";
          if (b64) {
            const buf = Buffer.from(b64, "base64");
            return new Response(buf, {
              status: 200,
              headers: {
                "Content-Type": mime,
                "Cache-Control": "public, max-age=300",
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
