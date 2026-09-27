import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { buildEvidencePack } from "@/lib/evidence-pack";
import { getMediaProvider } from "@/lib/providers/media";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";

const limiter = createRateLimiter({ limit: 4, windowMs: 60_000 });

/** GET: the project's evidence pack (manifest.json + face-blurred photos) as a zip. */
export async function GET(request: Request, ctx: RouteContext<"/api/evidence/[projectId]/zip">) {
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const { projectId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return Response.json({ error: "Bad id" }, { status: 400 });
  const pack = await buildEvidencePack(await getDb(), getMediaProvider(), projectId, getConfig().appUrl);
  if (!pack) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(new Uint8Array(pack.zip), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${pack.filename}"` } });
}
