import type { Sql } from "@/lib/db";

/**
 * Claim an idempotency key for this user+action.
 * Returns the cached JSON response if the key was already used, or null if
 * this is the first call (caller must proceed and then store the response).
 *
 * Uses INSERT … ON CONFLICT DO NOTHING + SELECT so concurrent callers with the
 * same key only one proceeds; the loser reads the winner's stored response
 * (or waits briefly if the winner has not finished yet).
 */
export async function claimIdempotencyKey(
  sql: Sql,
  opts: { key: string; userId: string; action: string },
): Promise<{ hit: true; response: unknown } | { hit: false }> {
  const inserted = await sql<{ key: string }>`
    insert into idempotency_keys (key, user_id, action)
    values (${opts.key}, ${opts.userId}, ${opts.action})
    on conflict (key) do nothing
    returning key
  `;
  if (inserted.length) return { hit: false };

  // Key already exists — return stored response if ready.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const rows = await sql<{ response_json: string | null; user_id: string }>`
      select response_json, user_id from idempotency_keys where key = ${opts.key} limit 1
    `;
    const row = rows[0];
    if (!row) return { hit: false }; // race: row vanished — treat as miss
    if (row.user_id !== opts.userId) {
      throw new Error("Idempotency key belongs to another account");
    }
    if (row.response_json != null) {
      try {
        return { hit: true, response: JSON.parse(row.response_json) };
      } catch {
        throw new Error("Stored idempotent response was corrupt");
      }
    }
    // Winner still working — short backoff.
    await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
  }
  throw new Error("A matching request is still in progress. Please wait a moment.");
}

export async function storeIdempotencyResponse(
  sql: Sql,
  key: string,
  response: unknown,
): Promise<void> {
  await sql`
    update idempotency_keys
    set response_json = ${JSON.stringify(response)}
    where key = ${key}
  `;
}
