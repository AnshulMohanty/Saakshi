import { z } from "zod";
import { adminAllowed } from "@/lib/admin";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";
import { DEMO_VISITOR, requestReview } from "@/lib/review";

const Body = z.object({ ids: z.array(z.string().regex(/^[0-9a-f-]{36}$/i)).min(1).max(500), reviewer: z.string().max(80).optional() });
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** POST {ids}: "Send to review" from the library. Same access as decisions: open in demo mode (rate-limited), the admin secret otherwise. */
export async function POST(request: Request) {
  const demo = getConfig().env.DEMO_MODE === "1";
  if (!demo && !adminAllowed(request)) return Response.json({ error: "Forbidden: review requests need x-demo-admin-secret" }, { status: 403 });
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected {ids: string[] (1–500 asset ids)}" }, { status: 400 });
  const queued = await requestReview(await getDb(), parsed.data.ids, { actor: demo ? DEMO_VISITOR : parsed.data.reviewer?.trim() || "reviewer" });
  return Response.json({ queued });
}
