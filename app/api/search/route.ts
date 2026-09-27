import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { getAIProvider } from "@/lib/providers/ai";
import { getMediaProvider } from "@/lib/providers/media";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";
import { runSearch } from "@/lib/search";

const Body = z.object({ q: z.string().trim().min(1).max(200) });
// Demo mode is public: parsing a query may call a paid model, so keep it modest.
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** POST {q}: parsed filters ("Understood as" chips, rejections, rewrites) and ranked results. */
export async function POST(request: Request) {
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected {q: string (1–200 chars)}" }, { status: 400 });
  const result = await runSearch({ db: await getDb(), ai: getAIProvider(), media: getMediaProvider() }, parsed.data.q);
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
