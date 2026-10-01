/**
 * Hash chain for the append-only audit log.
 *
 * hash = sha256(canonicalJson({ prev: prevHash, row })). Each row stores the previous row's
 * hash, so editing, deleting or reordering any row breaks verification from that point on.
 */
import { createHash } from "node:crypto";
import { canonicalJson, GENESIS_HASH } from "./canonical-json";

export { canonicalJson, GENESIS_HASH };

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Hash for a new row appended after `prevHash`. `row` must not contain prevHash/hash. */
export function append(prevHash: string, row: Record<string, unknown>): string {
  return sha256Hex(canonicalJson({ prev: prevHash, row }));
}

export type ChainedRow<T extends Record<string, unknown> = Record<string, unknown>> = T & {
  prevHash: string;
  hash: string;
};

/** Builds a chain from row payloads (for tests, seeding and exports). */
export function buildChain<T extends Record<string, unknown>>(rows: T[], start = GENESIS_HASH): ChainedRow<T>[] {
  let prev = start;
  return rows.map((row) => {
    const hash = append(prev, row);
    const chained = { ...row, prevHash: prev, hash };
    prev = hash;
    return chained;
  });
}

/**
 * Index of the first row whose link or content hash is wrong, or null if the chain is intact.
 * Rows must be in append order.
 */
export function verify(rows: ReadonlyArray<ChainedRow>, start = GENESIS_HASH): number | null {
  let prev = start;
  for (let i = 0; i < rows.length; i++) {
    const { prevHash, hash, ...row } = rows[i];
    if (prevHash !== prev || append(prevHash, row) !== hash) return i;
    prev = hash;
  }
  return null;
}
