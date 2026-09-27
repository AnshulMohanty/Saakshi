import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";
import { STEP_ORDER } from "@/lib/pipeline/steps";

/** GET: pipeline progress for the capture tray (uploading → processing → scored). */
export async function GET(_request: Request, ctx: RouteContext<"/api/assets/[id]/status">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const db = await getDb();
  const [a] = await db
    .select({
      id: assets.id,
      status: assets.status,
      source: assets.source,
      pipeline: assets.pipeline,
      capture: assets.capture,
      projectId: assets.projectId,
      spotId: assets.spotId,
      caption: assets.caption,
      trustScore: assets.trustScore,
      trustBand: assets.trustBand,
    })
    .from(assets)
    .where(eq(assets.id, id))
    .limit(1);
  if (!a) return Response.json({ error: "Not found" }, { status: 404 });
  const steps = STEP_ORDER.map((name) => ({ name, status: a.pipeline.steps[name]?.status ?? "pending", error: a.pipeline.steps[name]?.error }));
  return Response.json({
    id: a.id,
    status: a.status,
    source: a.source,
    steps,
    failed: steps.some((s) => s.status === "error"),
    scored: a.trustScore !== null,
    trustScore: a.trustScore,
    trustBand: a.trustBand,
    attested: a.capture?.attested ?? false,
    reasons: a.capture?.reasons ?? [],
    projectId: a.projectId,
    spotId: a.spotId,
    caption: a.caption,
  });
}
