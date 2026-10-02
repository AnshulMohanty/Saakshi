import { stats } from "@/lib/demo-apis";
import { getDb } from "@/lib/db/client";
import { displayPolicy } from "@/lib/display-policy";

/** GET: counters from SQL (photos, verified, flagged, spots, witness photos today, projects, pairs). */
export async function GET() {
  return Response.json(await stats(await getDb(), new Date(), displayPolicy()), { headers: { "cache-control": "no-store" } });
}
