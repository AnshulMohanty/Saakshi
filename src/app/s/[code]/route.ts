import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { spots } from "@/lib/db/schema";
import { SHORT_CODE } from "@/lib/short-link";

/** GET /s/<code>: a poster's short link → the spot page (307). Unknown or ambiguous codes are 404. */
export async function GET(request: Request, ctx: RouteContext<"/s/[code]">) {
  const code = (await ctx.params).code.toLowerCase();
  if (!SHORT_CODE.test(code)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const rows = await db
    .select({ id: spots.id, slug: spots.slug })
    .from(spots)
    .where(sql`replace(${spots.id}::text, '-', '') like ${`${code}%`}`)
    .limit(2);
  if (rows.length !== 1) return new Response("Not found", { status: 404 });
  return Response.redirect(new URL(`/spots/${encodeURIComponent(rows[0].slug ?? rows[0].id)}`, request.url), 307);
}
