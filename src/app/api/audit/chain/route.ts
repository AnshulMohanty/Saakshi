import { auditPayload, chainRows, verifyChain } from "@/lib/audit";
import { auditLabel } from "@/lib/audit-labels";
import { getDb } from "@/lib/db/client";

/**
 * GET ?assetId=: that photo's audit chain as stored (B5.9): each row's hashed payload (lib/audit
 * auditPayload), prevHash and hash, so the browser can recompute every hash with Web Crypto in
 * the same canonical form (lib/hashchain-web.ts). `label` is words for the timeline, outside the
 * hash; `server` is the server's own verification, which stays authoritative.
 */
export async function GET(request: Request) {
  const assetId = new URL(request.url).searchParams.get("assetId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return Response.json({ error: "Expected ?assetId=<uuid>" }, { status: 400 });
  const db = await getDb();
  const [rows, server] = await Promise.all([chainRows(db, assetId), verifyChain(db, assetId)]);
  return Response.json(
    {
      assetId,
      rows: rows.map((r) => ({ seq: r.seq, row: auditPayload(r), prevHash: r.prevHash, hash: r.hash, label: auditLabel(r.action, r.detail as Record<string, unknown>) })),
      server: { intact: server.intact, entries: server.entries, firstBrokenAt: server.firstBrokenAt },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
