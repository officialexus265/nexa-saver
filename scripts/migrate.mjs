#!/usr/bin/env node
/**
 * Applies pending SQL files from ./migrations to the database in DATABASE_URL (Neon).
 *
 * Runs as part of `npm run build` (so every Vercel deploy migrates first) and can be
 * run by hand with `npm run db:migrate`. Each file runs in one transaction and is
 * recorded by name in `_migrations`, so it is applied exactly once.
 *
 *   - No DATABASE_URL on Vercel / CI  -> fail (never ship a build with an unmigrated DB)
 *   - No DATABASE_URL locally         -> skip with a notice
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  if (process.env.VERCEL || process.env.CI) {
    console.error("[migrate] DATABASE_URL is not set — add your Neon connection string to the environment.");
    process.exit(1);
  }
  console.log("[migrate] DATABASE_URL not set — skipping.");
  process.exit(0);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function main() {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    // Serialise concurrent deploys.
    await client.query("SELECT pg_advisory_lock(727274)");
    const applied = new Set((await client.query("SELECT name FROM _migrations")).rows.map((r) => r.name));
    let count = 0;
    for (const name of files) {
      if (applied.has(name)) continue;
      const text = await readFile(join(dir, name), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(text);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.error(`[migrate] failed applying ${name}`);
        throw err;
      }
      console.log(`[migrate] applied ${name}`);
      count += 1;
    }
    console.log(count ? `[migrate] done — ${count} applied.` : "[migrate] up to date.");
    await client.query("SELECT pg_advisory_unlock(727274)");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] error:", err?.message ?? err);
  process.exit(1);
});
