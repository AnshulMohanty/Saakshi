import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getMediaProvider } from "@/lib/providers/media";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";
import { decideReview, ReviewError } from "@/lib/review";

const Body = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(1000),
  reviewer: z.string().max(80).optional(),
});

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

/**
 * POST {decision, note, reviewer?}: approve or reject a photo. The note is required. The Trust
 * Engine's score and band never change; status, moderation and the audit trail do.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/review/[assetId]">) {
  const { assetId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return Response.json({ error: "Bad id" }, { status: 400 });
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected {decision: approve|reject, note}" }, { status: 400 });
  try {
    const out = await decideReview(await getDb(), getMediaProvider(), { assetId, ...parsed.data, actor: parsed.data.reviewer?.trim() || "reviewer" });
    return Response.json(out);
  } catch (err) {
    if (err instanceof ReviewError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
