import { verifyAllChains, verifyChain } from "@/lib/audit";
import { getDb } from "@/lib/db/client";

/**
 * GET ?assetId=: re-walks that photo's hash chain → {intact, entries, firstBrokenAt}.
 * Without assetId: every chain → {ok, chains, entries, broken}.
 */
export async function GET(request: Request) {
  const assetId = new URL(request.url).searchParams.get("assetId");
  const db = await getDb();
  const headers = { "cache-control": "no-store" };
  if (!assetId) {
    const all = await verifyAllChains(db);
    return Response.json({ ok: all.ok, chains: all.chains, entries: all.entries, broken: all.broken }, { headers });
  }
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return Response.json({ error: "Bad assetId" }, { status: 400 });
  const v = await verifyChain(db, assetId);
  return Response.json({ intact: v.intact, entries: v.entries, firstBrokenAt: v.firstBrokenAt }, { headers });
}
