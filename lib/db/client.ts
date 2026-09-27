/**
 * Database client. PGlite (+ pgvector) in ./.data/pglite by default; Postgres when DATABASE_URL
 * is set. Both run the same Drizzle schema and migrations.
 */
import "server-only";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getConfig } from "../config";
import { runDataMigrations } from "./data-migrations";
import { acquireDataDirLock, releaseDataDirLock } from "./lock";
import * as schema from "./schema";

export type Schema = typeof schema;
export type DB = PgDatabase<PgQueryResultHKT, Schema>;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

interface Handle {
  db: DB;
  kind: "pglite" | "postgres";
  close: () => Promise<void>;
}

/**
 * Opens PGlite with pgvector and applies pending migrations. `dataDir` undefined → in-memory
 * (tests). Callers own the returned handle.
 */
export async function openPglite(dataDir?: string, { migrate = true } = {}): Promise<Handle & { client: PGlite }> {
  const [{ PGlite }, { vector }, { drizzle }, { migrate: runMigrations }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite-pgvector"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  if (dataDir) acquireDataDirLock(dataDir);
  const client = await PGlite.create(dataDir, { extensions: { vector } });
  const db = drizzle({ client, schema });
  if (migrate) {
    await runMigrations(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await runDataMigrations(db);
  }
  return {
    db: db satisfies DB,
    client,
    kind: "pglite",
    close: async () => {
      await client.close();
      if (dataDir) releaseDataDirLock(dataDir);
    },
  };
}

export async function openPostgres(url: string, { migrate = false } = {}): Promise<Handle> {
  const [{ default: postgres }, { drizzle }, { migrate: runMigrations }] = await Promise.all([
    import("postgres"),
    import("drizzle-orm/postgres-js"),
    import("drizzle-orm/postgres-js/migrator"),
  ]);
  // prepare: false keeps Supabase's transaction-mode pooler happy.
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle({ client, schema });
  if (migrate) {
    await runMigrations(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await runDataMigrations(db);
  }
  return { db: db satisfies DB, kind: "postgres", close: () => client.end() };
}

// One handle per process; kept on globalThis so dev hot reloads don't open a second PGlite.
const g = globalThis as typeof globalThis & { __saakshiDb?: Promise<Handle> };

async function open(): Promise<Handle> {
  const { env } = getConfig();
  if (env.DATABASE_URL) return openPostgres(env.DATABASE_URL);
  // Local PGlite migrates itself on open, so a fresh checkout works even without db:migrate.
  return openPglite(path.resolve(env.PGLITE_DIR));
}

export function getDbHandle(): Promise<Handle> {
  g.__saakshiDb ??= open().catch((err) => {
    g.__saakshiDb = undefined;
    throw err;
  });
  return g.__saakshiDb;
}

export async function getDb(): Promise<DB> {
  return (await getDbHandle()).db;
}

export async function closeDb(): Promise<void> {
  const handle = g.__saakshiDb;
  g.__saakshiDb = undefined;
  if (handle) await (await handle).close();
}

/** Rows from `db.execute()`, whose result shape differs between drivers (array vs { rows }). */
export function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []);
}
