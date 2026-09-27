/**
 * Hash chain for the append-only audit log.
 *
 * hash = sha256(canonicalJson({ prev: prevHash, row })). Each row stores the previous row's
 * hash, so editing, deleting or reordering any row breaks verification from that point on.
 */
import { createHash } from "node:crypto";

/** prevHash of the first row in a chain. */
export const GENESIS_HASH = "0".repeat(64);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Deterministic JSON: object keys sorted, no whitespace, Dates as ISO strings.
 * `undefined` object members are dropped (as JSON.stringify does); non-finite numbers,
 * bigints, functions and symbols are rejected rather than silently coerced.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, "$"));
}

function normalize(value: unknown, path: string): Json {
  if (value === null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError(`Invalid Date at ${path}`);
    return value.toISOString();
  }
  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
      return value;
    case "object": {
      if (Array.isArray(value)) return value.map((v, i) => (v === undefined ? null : normalize(v, `${path}[${i}]`)));
      const out: { [key: string]: Json } = {};
      for (const key of Object.keys(value).sort()) {
        const v = (value as Record<string, unknown>)[key];
        if (v !== undefined) out[key] = normalize(v, `${path}.${key}`);
      }
      return out;
    }
    default:
      throw new TypeError(`Unsupported ${typeof value} at ${path}`);
  }
}

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
