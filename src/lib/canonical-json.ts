/**
 * Deterministic JSON for the audit hash chain (pure, browser-safe): lib/hashchain.ts hashes it
 * with node:crypto, lib/hashchain-web.ts with Web Crypto, so the evidence page can recompute a
 * chain the server stored (B5.9).
 */

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
