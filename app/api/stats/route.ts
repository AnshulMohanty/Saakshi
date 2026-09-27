import { stats } from "@/lib/demo-apis";
import { getDb } from "@/lib/db/client";

/** GET: counters from SQL (photos, verified, flagged, spots, witness photos today, projects, pairs). */
export async function GET() {
  return Response.json(await stats(await getDb()), { headers: { "cache-control": "no-store" } });
}
