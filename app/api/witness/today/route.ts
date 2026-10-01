import { getDb } from "@/lib/db/client";
import { displayPolicy } from "@/lib/display-policy";
import { wallCounters } from "@/lib/wall/view";

/** GET: today's Witness Capture counts (since midnight IST) for the Wall, from SQL (rule 1). */
export async function GET() {
  return Response.json(await wallCounters(await getDb(), displayPolicy()), { headers: { "cache-control": "no-store" } });
}
