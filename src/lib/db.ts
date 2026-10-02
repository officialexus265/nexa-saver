/**
 * Server-only Postgres client for Neon (via node-postgres).
 *
 * Set `DATABASE_URL` to your Neon *pooled* connection string
 * (the host contains `-pooler`, and ends with `?sslmode=require`).
 *
 *   const sql = await getSql();
 *   const rows = await sql`select * from profiles where user_id = ${id}`;
 *   await withTransaction(async (tx) => { await tx`update ...`; await tx`insert ...`; });
 *
 * Schema lives in `migrations/*.sql` and is applied by `npm run db:migrate`
 * (which also runs automatically as part of `npm run build` on Vercel).
 */
import type { Pool } from "pg";

/** Minimal tagged-template SQL surface. Values are always sent as parameters. */
export interface Sql {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

// Postgres sends every value as text plus a type OID; pg's default parsing is
// surprising for these three, so normalise them to JSON-safe shapes:
//   int8/bigint (incl. count(*)) -> number
//   date                         -> 'YYYY-MM-DD' string
//   interval                     -> Postgres interval text
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

type Queryable = Pick<Pool, "query">;

function toSql(client: Queryable): Sql {
  const run = async <T>(text: string, params: unknown[]): Promise<T[]> => {
    const res = await client.query(text, params);
    return res.rows as T[];
  };
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

/** The configured connection string, or a clear error telling you what to set. */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Create a Neon project, copy its pooled connection string " +
        "into .env (local) or the Vercel project's environment variables (deployed).",
    );
  }
  return url;
}

const globalRef = globalThis as typeof globalThis & {
  __nexaPool__?: Promise<Pool>;
};

/** One pool per server instance; warm serverless invocations reuse it. */
export function getPool(): Promise<Pool> {
  globalRef.__nexaPool__ ??= (async () => {
    if (typeof window !== "undefined") {
      throw new Error("@/lib/db is server-only — call it from a server function or route handler.");
    }
    const { Pool, types } = await import("pg");
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    const pool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    // An idle client erroring (e.g. Neon closing a connection) must not crash the process.
    pool.on("error", (err) => console.error("[db] idle client error:", err.message));
    return pool;
  })().catch((err) => {
    globalRef.__nexaPool__ = undefined; // do not memoize a failure
    throw err;
  });
  return globalRef.__nexaPool__;
}

/** Shared SQL client (autocommit per statement). */
export async function getSql(): Promise<Sql> {
  return toSql(await getPool());
}

/**
 * Run several statements atomically. Everything inside `fn` commits together or
 * is rolled back if `fn` throws. Use this for any money movement.
 */
export async function withTransaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(toSql(client));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already gone — surface the original error */
    }
    throw err;
  } finally {
    client.release();
  }
}
