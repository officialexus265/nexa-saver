import { env } from "@/lib/env.server";

/**
 * Optional error reporting. Set SENTRY_DSN to enable; without it, logs to console only.
 * Uses the Sentry envelope HTTP API so we do not require the @sentry/node package.
 */
export async function reportError(err: unknown, context?: Record<string, unknown>): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error("[error]", message, context ?? {}, stack);

  const dsn = env("SENTRY_DSN");
  if (!dsn) return;

  try {
    // DSN form: https://<key>@<host>/<project>
    const match = dsn.match(/^https?:\/\/([^@]+)@([^/]+)\/(.+)$/);
    if (!match) return;
    const [, key, host, project] = match;
    const url = `https://${host}/api/${project}/store/`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=nexa-saver/1.0`,
      },
      body: JSON.stringify({
        message,
        level: "error",
        platform: "node",
        extra: { ...context, stack },
        timestamp: Date.now() / 1000,
      }),
    });
  } catch {
    /* never throw from monitoring */
  }
}
