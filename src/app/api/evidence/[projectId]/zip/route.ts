import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { buildEvidencePack } from "@/lib/evidence-pack";
import { getMediaProvider } from "@/lib/providers/media";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";

const limiter = createRateLimiter({ limit: 4, windowMs: 60_000 });
/** One build per project per 10 minutes: a pack fetches up to 100 derivatives. */
const cache = new Map<string, { at: number; zip: Uint8Array; filename: string }>();
const TTL_MS = 10 * 60_000;

/** GET: the project's evidence pack (manifest.json + face-blurred photos) as a zip. */
export async function GET(request: Request, ctx: RouteContext<"/api/evidence/[projectId]/zip">) {
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const { projectId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return Response.json({ error: "Bad id" }, { status: 400 });
  let hit = cache.get(projectId);
  if (!hit || Date.now() - hit.at > TTL_MS) {
    const pack = await buildEvidencePack(await getDb(), getMediaProvider(), projectId, getConfig().appUrl);
    if (!pack) return Response.json({ error: "Not found" }, { status: 404 });
    hit = { at: Date.now(), zip: new Uint8Array(pack.zip), filename: pack.filename };
    if (cache.size > 50) cache.clear();
    cache.set(projectId, hit);
  }
  return new Response(new Uint8Array(hit.zip), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${hit.filename}"` } });
}
