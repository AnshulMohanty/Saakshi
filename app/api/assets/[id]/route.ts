import { getDb } from "@/lib/db/client";
import { assetDetail } from "@/lib/library";
import { getMediaProvider } from "@/lib/providers/media";

/** GET: everything the library drawer shows for one asset. */
export async function GET(_request: Request, ctx: RouteContext<"/api/assets/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const detail = await assetDetail(await getDb(), getMediaProvider(), id);
  return detail ? Response.json(detail, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "Not found" }, { status: 404 });
}
