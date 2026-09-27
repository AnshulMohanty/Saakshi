/**
 * Append-only, hash-chained audit log: one chain per asset, plus one system chain (asset_id null).
 * Chain maths live in lib/hashchain.ts (pure, tested); this module handles storage.
 *
 * - A row's prev_hash is the hash of the previous row *of the same chain* (genesis for the first).
 * - Nothing recomputes or rewrites hashes after the fact. Deleting an asset deletes its whole
 *   chain (FK cascade) and leaves every other chain valid. The one sanctioned rewrite was the
 *   one-time migration to per-asset chains (lib/db/data-migrations.ts), itself recorded as a
 *   system event.
 * - Known limit of any hash chain: removing the *newest* rows of a chain is not detectable from
 *   the chain alone.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { DB } from "./db/client";
import { auditLog, type AuditRow } from "./db/schema";
import { append, GENESIS_HASH, verify } from "./hashchain";

export interface AuditEntry {
  /** The asset whose chain this belongs to; omit/null for the system chain. */
  assetId?: string | null;
  actor: string;
  action: string;
  detail?: Record<string, unknown>;
}

/** The hashed payload of a row: everything except seq, prevHash and hash. */
export function auditPayload(row: Pick<AuditRow, "id" | "assetId" | "actor" | "action" | "detail" | "at">) {
  return {
    id: row.id,
    assetId: row.assetId ?? null,
    actor: row.actor,
    action: row.action,
    detail: row.detail ?? {},
    at: row.at.toISOString(),
  };
}

const chainWhere = (assetId: string | null): SQL => (assetId ? eq(auditLog.assetId, assetId) : isNull(auditLog.assetId));
const chainLockKey = (assetId: string | null) => `saakshi.audit:${assetId ?? "system"}`;

/** Appends one entry to its chain. A per-chain advisory lock stops concurrent appends forking it. */
export async function appendAudit(db: DB, entry: AuditEntry): Promise<AuditRow> {
  const assetId = entry.assetId ?? null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${chainLockKey(assetId)}))`);
    const [last] = await tx.select({ hash: auditLog.hash }).from(auditLog).where(chainWhere(assetId)).orderBy(desc(auditLog.seq)).limit(1);
    const prevHash = last?.hash ?? GENESIS_HASH;
    // Millisecond precision matches the timestamp(3) column, so the payload round-trips exactly.
    const at = new Date(Math.floor(Date.now()));
    const payload = auditPayload({ id: randomUUID(), assetId, actor: entry.actor, action: entry.action, detail: entry.detail ?? {}, at });
    const [row] = await tx
      .insert(auditLog)
      .values({ ...payload, at, prevHash, hash: append(prevHash, payload) })
      .returning();
    return row;
  });
}

export interface ChainVerification {
  intact: boolean;
  entries: number;
  /** Index (in append order) of the first broken row, or null. */
  firstBrokenAt: number | null;
  brokenRow: AuditRow | null;
}

async function verifyRows(rows: AuditRow[]): Promise<ChainVerification> {
  const at = verify(rows.map((r) => ({ ...auditPayload(r), prevHash: r.prevHash, hash: r.hash })));
  return { intact: at === null, entries: rows.length, firstBrokenAt: at, brokenRow: at === null ? null : rows[at] };
}

/** Checks one asset's chain. */
export async function verifyChain(db: DB, assetId: string): Promise<ChainVerification> {
  return verifyRows(await db.select().from(auditLog).where(chainWhere(assetId)).orderBy(asc(auditLog.seq)));
}

/** Checks the system chain (rows with no asset). */
export async function verifySystem(db: DB): Promise<ChainVerification> {
  return verifyRows(await db.select().from(auditLog).where(chainWhere(null)).orderBy(asc(auditLog.seq)));
}

export interface AllChainsVerification {
  ok: boolean;
  chains: number;
  entries: number;
  system: ChainVerification;
  broken: Array<{ assetId: string | null; firstBrokenAt: number }>;
}

/** Every asset chain plus the system chain. */
export async function verifyAllChains(db: DB): Promise<AllChainsVerification> {
  const rows = await db.select().from(auditLog).orderBy(asc(auditLog.seq));
  const byChain = new Map<string | null, AuditRow[]>();
  for (const r of rows) byChain.set(r.assetId, [...(byChain.get(r.assetId) ?? []), r]);
  const broken: AllChainsVerification["broken"] = [];
  let system: ChainVerification = { intact: true, entries: 0, firstBrokenAt: null, brokenRow: null };
  for (const [assetId, chain] of byChain) {
    const v = await verifyRows(chain);
    if (assetId === null) system = v;
    if (!v.intact) broken.push({ assetId, firstBrokenAt: v.firstBrokenAt! });
  }
  return { ok: broken.length === 0, chains: byChain.size, entries: rows.length, system, broken };
}

/** Rows of one chain, oldest first. */
export async function chainRows(db: DB, assetId: string | null): Promise<AuditRow[]> {
  return db.select().from(auditLog).where(and(chainWhere(assetId))).orderBy(asc(auditLog.seq));
}
