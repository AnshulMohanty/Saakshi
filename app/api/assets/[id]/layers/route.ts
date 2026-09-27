import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { assetLayers } from "@/lib/demo-apis";
import { getMediaProvider } from "@/lib/providers/media";

/** GET: what the 3D evidence viewer stacks: signed photo, capture facts, pHash bits, AI tags, mask, trust, proof strip. */
export async function GET(_request: Request, ctx: RouteContext<"/api/assets/[id]/layers">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const layers = await assetLayers(await getDb(), getMediaProvider(), id, getConfig().appUrl);
  return layers ? Response.json(layers, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "Not found" }, { status: 404 });
}
