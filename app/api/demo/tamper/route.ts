import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";
import { tamperChips, tamperDemo } from "@/lib/demo-apis";
import { getMediaProvider } from "@/lib/providers/media";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/**
 * GET ?assetId=&chips=sig,blur (B5.6, the landing's chapter 6): the signed preview link with
 * those chips removed (signature kept unless removed), requested server-side →
 * {originalStatus: 200, status: 401, removed}. `chips=` empty → the untouched link's status.
 * GET ?assetId=&remove=blur_faces (Phase 7): one Transform step removed → {originalStatus,
 * tamperedStatus, urls}.
 */
export async function GET(request: Request) {
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const url = new URL(request.url);
  const assetId = url.searchParams.get("assetId") ?? "";
  const chips = url.searchParams.get("chips");
  const remove = url.searchParams.get("remove") ?? "blur_faces";
  if (!/^[0-9a-f-]{36}$/i.test(assetId) || (chips !== null && !/^[a-z0-9,]{0,60}$/.test(chips)) || !/^[a-z_]{2,20}$/.test(remove)) return Response.json({ error: "Expected ?assetId=<uuid>&chips=<k,k> or &remove=<step>" }, { status: 400 });
  const [a] = await (await getDb()).select({ publicId: assets.cldPublicId }).from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!a) return Response.json({ error: "Not found" }, { status: 404 });
  const fetchStatus = async (u: string) => (await fetch(new URL(u, url), { cache: "no-store" })).status;
  const out = chips !== null ? await tamperChips(getMediaProvider(), a.publicId, chips.split(",").filter(Boolean), fetchStatus) : await tamperDemo(getMediaProvider(), a.publicId, remove, fetchStatus);
  return "error" in out ? Response.json(out, { status: 400 }) : Response.json(out);
}
