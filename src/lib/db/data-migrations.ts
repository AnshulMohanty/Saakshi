/**
 * One-time data migrations that can't be written in SQL (our hashes use canonical JSON, which
 * Postgres can't reproduce). Each runs once, recorded in the data_migrations table, right after
 * the SQL migrations, for both PGlite and Postgres.
 */
import { asc, eq, sql } from "drizzle-orm";
import { append, GENESIS_HASH } from "../hashchain";
import type { DB } from "./client";
import { auditLog, dataMigrations } from "./schema";

/** Payload hashed for a row (kept in sync with lib/audit.ts auditPayload). */
function payload(r: typeof auditLog.$inferSelect) {
  return { id: r.id, assetId: r.assetId ?? null, actor: r.actor, action: r.action, detail: r.detail ?? {}, at: r.at.toISOString() };
}

/**
 * 0003: one global chain → one chain per asset plus a system chain. The only sanctioned hash
 * rewrite; it is recorded as a system event ("audit.chains_rebuilt").
 */
async function perAssetChains(tx: DB): Promise<Record<string, unknown>> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('saakshi.audit:migration'))`);
  const rows = await tx.select().from(auditLog).orderBy(asc(auditLog.seq));
  const heads = new Map<string | null, string>();
  let rewritten = 0;
  for (const r of rows) {
    const prev = heads.get(r.assetId) ?? GENESIS_HASH;
    const hash = append(prev, payload(r));
    if (r.prevHash !== prev || r.hash !== hash) {
      await tx.update(auditLog).set({ prevHash: prev, hash }).where(eq(auditLog.id, r.id));
      rewritten++;
    }
    heads.set(r.assetId, hash);
  }
  const detail = { rows: rows.length, rewritten, chains: heads.size };
  if (rows.length > 0) {
    // Recorded on the system chain, appended after the rebuild.
    const at = new Date(Math.floor(Date.now()));
    const p = { id: crypto.randomUUID(), assetId: null, actor: "migration", action: "audit.chains_rebuilt", detail, at: at.toISOString() };
    const prev = heads.get(null) ?? GENESIS_HASH;
    await tx.insert(auditLog).values({ ...p, at, prevHash: prev, hash: append(prev, p) });
  }
  return detail;
}

const MIGRATIONS: Array<{ id: string; run: (tx: DB) => Promise<Record<string, unknown>> }> = [
  { id: "0003-audit-per-asset-chains", run: perAssetChains },
];

export async function runDataMigrations(db: DB): Promise<string[]> {
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    const done = await db.select({ id: dataMigrations.id }).from(dataMigrations).where(eq(dataMigrations.id, m.id)).limit(1);
    if (done.length) continue;
    await db.transaction(async (tx) => {
      const detail = await m.run(tx as unknown as DB);
      await tx.insert(dataMigrations).values({ id: m.id, detail });
    });
    applied.push(m.id);
  }
  return applied;
}
