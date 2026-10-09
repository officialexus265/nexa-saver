import { createFileRoute } from "@tanstack/react-router";

/**
 * Public liveness/readiness probe — no secrets.
 * GET /api/health
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let db = "unknown";
        let depositsPaused = false;
        let withdrawalsPaused = false;
        let signupEnabled = true;
        try {
          const { getSql } = await import("@/lib/db");
          const sql = await getSql();
          await sql`select 1 as ok`;
          db = "ok";
          try {
            const { depositsPausedDb, withdrawalsPausedDb } = await import("@/lib/nexa/kill-switch.server");
            depositsPaused = await depositsPausedDb(sql);
            withdrawalsPaused = await withdrawalsPausedDb(sql);
          } catch {
            /* */
          }
          try {
            const { getLaunchSettings } = await import("@/lib/nexa/launch.server");
            const launch = await getLaunchSettings(sql);
            signupEnabled = launch.signupEnabled;
          } catch {
            /* */
          }
        } catch {
          db = "error";
        }
        const body = {
          ok: db === "ok",
          service: "nexa-saver",
          db,
          depositsPaused,
          withdrawalsPaused,
          signupEnabled,
          ms: Date.now() - started,
        };
        return new Response(JSON.stringify(body), {
          status: db === "ok" ? 200 : 503,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
