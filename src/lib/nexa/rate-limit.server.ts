import type { Sql } from "@/lib/db";

/**
 * Fixed-window rate limit stored in Postgres (works on serverless).
 * Returns true if the request is allowed; false if the bucket is over limit.
 */
export async function hitRateLimit(
  sql: Sql,
  opts: { bucket: string; limit: number; windowSeconds: number },
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const rows = await sql<{ hits: number; window_start: unknown }>`
    select hits, window_start from rate_limits where bucket = ${opts.bucket} limit 1
  `;
  const now = Date.now();
  const row = rows[0];
  const windowStartMs = row
    ? row.window_start instanceof Date
      ? row.window_start.getTime()
      : Date.parse(String(row.window_start))
    : 0;
  const windowExpired = !row || !Number.isFinite(windowStartMs) || now - windowStartMs >= opts.windowSeconds * 1000;

  if (windowExpired) {
    await sql`
      insert into rate_limits (bucket, hits, window_start)
      values (${opts.bucket}, 1, now())
      on conflict (bucket) do update
        set hits = 1, window_start = now()
    `;
    return { allowed: true, remaining: opts.limit - 1, retryAfterSeconds: opts.windowSeconds };
  }

  const hits = Number(row.hits) + 1;
  if (hits > opts.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStartMs + opts.windowSeconds * 1000 - now) / 1000),
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  await sql`
    update rate_limits set hits = ${hits} where bucket = ${opts.bucket}
  `;
  return {
    allowed: true,
    remaining: opts.limit - hits,
    retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + opts.windowSeconds * 1000 - now) / 1000)),
  };
}

export async function assertRateLimit(
  sql: Sql,
  opts: { bucket: string; limit: number; windowSeconds: number; message?: string },
): Promise<void> {
  const result = await hitRateLimit(sql, opts);
  if (!result.allowed) {
    throw new Error(
      opts.message ??
        `Too many attempts. Try again in about ${result.retryAfterSeconds} seconds.`,
    );
  }
}
