/**
 * The audit hash chain recomputed in the browser (B5.9): the same canonical JSON as
 * lib/hashchain.ts, hashed with Web Crypto SHA-256. The server's chain stays authoritative; this
 * lets a visitor check it without trusting the page's word for it.
 */
import { canonicalJson, GENESIS_HASH } from "./canonical-json";

export interface WebChainRow {
  /** The hashed payload: id, assetId, actor, action, detail, at (lib/audit.ts auditPayload). */
  row: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export async function sha256HexWeb(input: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const appendWeb = (prevHash: string, row: Record<string, unknown>) => sha256HexWeb(canonicalJson({ prev: prevHash, row }));

/** Recomputes every hash in order; returns the recomputed hashes and the first broken index (or null). */
export async function verifyWeb(rows: ReadonlyArray<WebChainRow>, start = GENESIS_HASH): Promise<{ hashes: string[]; brokenAt: number | null }> {
  let prev = start;
  const hashes: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const h = await appendWeb(rows[i].prevHash, rows[i].row);
    hashes.push(h);
    if (rows[i].prevHash !== prev || h !== rows[i].hash) return { hashes, brokenAt: i };
    prev = rows[i].hash;
  }
  return { hashes, brokenAt: null };
}
