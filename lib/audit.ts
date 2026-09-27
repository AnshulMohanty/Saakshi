/**
 * Append-only, hash-chained audit log backed by the audit_log table.
 * Chain maths live in lib/hashchain.ts (pure, tested); this module handles storage.
 */
import { randomUUID } from "node:crypto";
import { asc, desc, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import { auditLog, type AuditRow } from "./db/schema";
import { append, GENESIS_HASH, verify } from "./hashchain";

export interface AuditEntry {
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

/** Appends one entry. Serialised with an advisory lock so concurrent appends can't fork the chain. */
export async function appendAudit(db: DB, entry: AuditEntry): Promise<AuditRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('saakshi.audit_log'))`);
    const [last] = await tx.select({ hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.seq)).limit(1);
    const prevHash = last?.hash ?? GENESIS_HASH;
    // Millisecond precision matches the timestamp(3) column, so the payload round-trips exactly.
    const at = new Date(Math.floor(Date.now()));
    const payload = auditPayload({
      id: randomUUID(),
      assetId: entry.assetId ?? null,
      actor: entry.actor,
      action: entry.action,
      detail: entry.detail ?? {},
      at,
    });
    const [row] = await tx
      .insert(auditLog)
      .values({ ...payload, at, prevHash, hash: append(prevHash, payload) })
      .returning();
    return row;
  });
}

export interface AuditVerification {
  ok: boolean;
  count: number;
  /** Index (in seq order) of the first broken row, or null. */
  brokenAt: number | null;
  brokenRow: AuditRow | null;
}

export async function verifyAuditLog(db: DB): Promise<AuditVerification> {
  const rows = await db.select().from(auditLog).orderBy(asc(auditLog.seq));
  const brokenAt = verify(rows.map((r) => ({ ...auditPayload(r), prevHash: r.prevHash, hash: r.hash })));
  return { ok: brokenAt === null, count: rows.length, brokenAt, brokenRow: brokenAt === null ? null : rows[brokenAt] };
}
