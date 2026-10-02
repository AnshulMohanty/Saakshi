import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adminAllowed } from "@/lib/admin";
import { getDb } from "@/lib/db/client";
import { comparisons } from "@/lib/db/schema";
import { autoPairProject, manualPair, PairError, remeasure } from "@/lib/measure/measure";
import { getPipelineDeps } from "@/lib/pipeline";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";

const Uuid = z.string().regex(/^[0-9a-f-]{36}$/i);
const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto"), projectId: Uuid }),
  z.object({ mode: z.literal("manual"), projectId: Uuid, assetIds: z.tuple([Uuid, Uuid]), chosenBy: z.string().max(80).optional(), note: z.string().max(500).optional() }),
  z.object({ mode: z.literal("remeasure"), comparisonIds: z.array(Uuid).min(1).max(50) }),
]);

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/** GET ?projectId=: a project's comparisons, newest first. */
export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId || !Uuid.safeParse(projectId).success) return Response.json({ error: "projectId required" }, { status: 400 });
  const rows = await (await getDb()).select().from(comparisons).where(eq(comparisons.projectId, projectId)).orderBy(desc(comparisons.updatedAt));
  return Response.json({ comparisons: rows }, { headers: { "cache-control": "no-store" } });
}

/**
 * POST {mode}: "auto" pairs a project by the rules and measures the pairs; "manual" measures a
 * pair a person chose (the rules still apply, and a broken rule is a 422 with the reasons);
 * "remeasure" recomputes comparisons from fresh masks. Development: open; production: admin secret.
 */
export async function POST(request: Request) {
  if (!adminAllowed(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected {mode: auto|manual|remeasure, …}" }, { status: 400 });
  const deps = await getPipelineDeps();
  const b = parsed.data;
  try {
    if (b.mode === "auto") {
      const r = await autoPairProject(deps, b.projectId);
      return Response.json({
        pairs: r.result.pairs,
        comparisons: r.comparisons,
        removed: r.removed,
        candidates: r.result.candidates.length,
        rejected: r.result.candidates.filter((c) => !c.ok).map((c) => ({ beforeId: c.beforeId, afterId: c.afterId, rejects: c.rejects })),
        excluded: r.result.excluded,
      });
    }
    if (b.mode === "manual") return Response.json({ comparisons: await manualPair(deps, b.projectId, b.assetIds, { chosenBy: b.chosenBy, note: b.note }) });
    return Response.json({ comparisons: await remeasure(deps, b.comparisonIds) });
  } catch (err) {
    if (err instanceof PairError) return Response.json({ error: err.message, reasons: err.reasons }, { status: err.reasons.includes("not_found") ? 404 : 422 });
    if (err instanceof Error && /not found/i.test(err.message)) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
