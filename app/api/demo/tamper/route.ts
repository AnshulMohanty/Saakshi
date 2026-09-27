import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";
import { tamperDemo } from "@/lib/demo-apis";
import { getMediaProvider } from "@/lib/providers/media";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/**
 * GET ?assetId=&remove=blur_faces: builds the signed preview URL, removes one step while keeping
 * the signature, requests both server-side → {originalStatus: 200, tamperedStatus: 401, urls}.
 */
export async function GET(request: Request) {
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const url = new URL(request.url);
  const assetId = url.searchParams.get("assetId") ?? "";
  const remove = url.searchParams.get("remove") ?? "blur_faces";
  if (!/^[0-9a-f-]{36}$/i.test(assetId) || !/^[a-z_]{2,20}$/.test(remove)) return Response.json({ error: "Expected ?assetId=<uuid>&remove=<step>" }, { status: 400 });
  const [a] = await (await getDb()).select({ publicId: assets.cldPublicId }).from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!a) return Response.json({ error: "Not found" }, { status: 404 });
  const out = await tamperDemo(getMediaProvider(), a.publicId, remove, async (u) => (await fetch(new URL(u, url), { cache: "no-store" })).status);
  return "error" in out ? Response.json(out, { status: 400 }) : Response.json(out);
}
