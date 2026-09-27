/**
 * Applies drizzle/ migrations to the configured database:
 * PGlite at PGLITE_DIR (default ./.data/pglite), or Postgres when DATABASE_URL is set.
 */
import path from "node:path";
import { sql } from "drizzle-orm";
import { getConfig } from "../lib/config";
import { openPglite, openPostgres, rowsOf, type DB } from "../lib/db/client";

async function main() {
  const { env } = getConfig();
  if (env.DATABASE_URL) {
    console.log("Migrating Postgres (DATABASE_URL)…");
    const handle = await openPostgres(env.DATABASE_URL, { migrate: true });
    await report(handle.db);
    await handle.close();
    return;
  }
  const dir = path.resolve(env.PGLITE_DIR);
  console.log(`Migrating PGlite at ${dir}…`);
  const handle = await openPglite(dir); // applies migrations on open
  await report(handle.db);
  await handle.close();
}

async function report(db: DB) {
  const rows = rowsOf<{ id: number }>(await db.execute(sql`select id from drizzle.__drizzle_migrations order by id`));
  console.log(`✓ ${rows.length} migration(s) applied; schema is up to date.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
