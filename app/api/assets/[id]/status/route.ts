import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";
import { displayPolicy } from "@/lib/display-policy";
import { decisiveReason, flagTitle } from "@/lib/landing/copy";
import { STEP_ORDER } from "@/lib/pipeline/steps";
import { assetMode, mockLabel, showNumber } from "@/lib/provenance";
import { describeReason } from "@/lib/trust";
import { ruleChips } from "@/lib/trust/labels";

/**
 * GET: pipeline progress for the capture screen (uploading → reading → checking → scored), then
 * the result its sheet shows: score (under the display policy: a mock-derived score never shows
 * in production), band, rule chips, the decisive reason and the server's fingerprint.
 */
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
      trustReasons: assets.trustReasons,
      phash: assets.phash,
      provenance: assets.provenance,
    })
    .from(assets)
    .where(eq(assets.id, id))
    .limit(1);
  if (!a) return Response.json({ error: "Not found" }, { status: 404 });
  const steps = STEP_ORDER.map((name) => ({ name, status: a.pipeline.steps[name]?.status ?? "pending", error: a.pipeline.steps[name]?.error }));
  const policy = displayPolicy();
  const shown = showNumber(a.trustScore, assetMode(a.provenance), policy);
  const decisive = decisiveReason(a.trustReasons ?? []);
  return Response.json({
    id: a.id,
    status: a.status,
    source: a.source,
    steps,
    failed: steps.some((s) => s.status === "error"),
    scored: a.trustScore !== null,
    trustScore: shown?.kind === "value" ? a.trustScore : null,
    trustBand: a.trustBand,
    scoreHidden: shown?.kind === "hidden" ? shown.text : null,
    scoreMock: shown?.kind === "value" && shown.mock,
    /** The badge on a mock-derived score ("Mock output", or "Prototype measurement" in the preview). */
    scoreTag: shown?.kind === "value" && shown.mock ? mockLabel(policy) : null,
    chips: a.trustReasons ? ruleChips(a.trustReasons) : [],
    decisive: decisive ? (decisive.kind === "hard" ? flagTitle(decisive) : describeReason(decisive)) : null,
    phash: a.phash,
    attested: a.capture?.attested ?? false,
    reasons: a.capture?.reasons ?? [],
    projectId: a.projectId,
    spotId: a.spotId,
    caption: a.caption,
  });
}
