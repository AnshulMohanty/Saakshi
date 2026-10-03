/**
 * Measuring photos and pairs against the database and media provider.
 *
 * Every photo is measured on the same frame (c_fill, g_auto, 800×600), so a before and an after
 * are compared pixel for pixel on the same crop. Results are cached forever in `measurements`
 * (a photo's mask for a frame and prompt never changes). Values are percentages of the frame.
 *
 * - cleanup / water: litter cover from extractMask("litter, garbage, plastic waste, floating
 *   waste", multiple). Secondary: items visible, the AI's counts (ai_estimated, with confidence).
 * - plantation: green cover from extractMask("trees, plants, grass"), checked against ExG green
 *   cover. More than 15 points apart → low confidence.
 * - When Cloudinary refuses the extraction for every prompt, the photo is "unmeasurable": its
 *   measure step records the reason, no number is stored, and it takes no part in pairs or
 *   baselines (media/extract-refusal.ts).
 */
import { and, count, countDistinct, eq, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { assets, comparisons, measurements, projects, spots, type Asset, type Comparison, type ComparisonDetail, type Measurement, type MetricId, type Project, type Spot } from "../db/schema";
import { captureDate } from "../media/composite";
import { FRAME, VIEW } from "../media/derivatives";
import { ExtractRefusedError } from "../media/extract-refusal";
import { compileTransform } from "../media/transform";
import type { MediaProvider } from "../providers/media";
import { DISAGREEMENT_POINTS, exgCover, maskCover, MASK_THRESHOLD } from "./cover";
import { chooseBaseline, evaluatePair, exclusionsOf, findPairs, type PairCandidate, type PairingResult, type PairPhoto, type PairProject, type PairSpot, type Stage } from "./pairing";

export const CAVEAT = "Measured on photo pixels. Camera angle, framing, season and light affect the result.";
export { FRAME, VIEW } from "../media/derivatives";
export const FRAME_KEY = compileTransform(FRAME);
export const LITTER_PROMPTS = ["litter", "garbage", "plastic-waste", "floating-waste"];
export const GREEN_PROMPTS = ["trees", "plants", "grass"];
export const DEFAULT_MEASURE_MAX = 40;

export type MeasureKind = "litter" | "green";
export const measureKind = (type: Project["type"]): MeasureKind | null =>
  type === "cleanup" || type === "water" ? "litter" : type === "plantation" ? "green" : null;

export const METRICS: Record<MeasureKind, { primary: MetricId; secondary: MetricId }> = {
  litter: { primary: "litter_cover", secondary: "items_visible" },
  green: { primary: "green_cover", secondary: "exg_green_cover" },
};
export const METRIC_LABEL: Record<MetricId, string> = {
  litter_cover: "Litter cover",
  items_visible: "Items visible",
  green_cover: "Green cover",
  exg_green_cover: "Green cover (ExG check)",
};
export const unitOf = (m: MetricId): "%" | "items" => (m === "items_visible" ? "items" : "%");

const LITTER_WORDS = /\b(litter|garbage|trash|rubbish|plastic|bottles?|bags?|waste|debris|wrappers?|cans?)\b/i;

export interface MeasureDeps {
  db: DB;
  media: MediaProvider;
  measureMax?: number;
}

/** The measure step recorded that Cloudinary couldn't measure this photo (the reason, else null). */
export function unmeasurableReason(a: Pick<Asset, "pipeline">): string | null {
  const out = a.pipeline?.steps?.measure?.output as { status?: string; reason?: string } | undefined;
  return out?.status === "unmeasurable" ? (out.reason ?? "Cloudinary refused the extraction") : null;
}

/** A photo's pairing view: witness device fix first, else EXIF/Commons GPS. */
export function pairPhotoOf(a: Asset): PairPhoto {
  const fix = a.source === "witness" ? a.capture?.deviceFix : null;
  return {
    id: a.id,
    spotId: a.spotId,
    location: fix ? { lat: fix.lat, lng: fix.lng } : a.exifLat !== null && a.exifLng !== null ? { lat: a.exifLat, lng: a.exifLng } : null,
    capturedAt: a.capturedAt?.toISOString() ?? null,
    capturedAtPrecision: a.capturedAtPrecision,
    band: a.trustBand,
    status: a.status,
    stage: (a.ai?.stage as Stage | undefined) ?? null,
    phash: a.phash,
    unmeasurable: unmeasurableReason(a) !== null,
  };
}

export const pairProjectOf = (p: Project): PairProject => ({ minPairGapHours: p.minPairGapHours, locationApproximate: p.locationApproximate });
export const pairSpotOf = (s: Spot): PairSpot => ({ id: s.id, center: { lat: s.lat, lng: s.lng }, radiusM: s.radiusM });

async function spotOf(db: DB, spotId: string | null): Promise<Spot | null> {
  if (!spotId) return null;
  const [s] = await db.select().from(spots).where(eq(spots.id, spotId)).limit(1);
  return s ?? null;
}

export type MeasureStatus = "measured" | "cached" | "capped" | "not_measured" | "unmeasurable";

/** Measures one photo on FRAME (cached). `enforceCap` applies MEASURE_MAX_PER_PROJECT. */
export async function measureAsset(deps: MeasureDeps, asset: Asset, kind: MeasureKind, { enforceCap = true } = {}): Promise<{ status: MeasureStatus; rows: Measurement[]; reason?: string }> {
  const { primary } = METRICS[kind];
  const existing = await deps.db.select().from(measurements).where(and(eq(measurements.assetId, asset.id), eq(measurements.frame, FRAME_KEY)));
  if (existing.some((m) => m.metric === primary)) return { status: "cached", rows: existing };
  // Already refused (the measure step's record): don't ask Cloudinary again.
  const known = unmeasurableReason(asset);
  if (known) return { status: "unmeasurable", rows: existing, reason: known };
  try {
    return await measureNow(deps, asset, kind, existing, enforceCap);
  } catch (err) {
    if (err instanceof ExtractRefusedError) return { status: "unmeasurable", rows: existing, reason: err.message };
    throw err;
  }
}

async function measureNow(deps: MeasureDeps, asset: Asset, kind: MeasureKind, existing: Measurement[], enforceCap: boolean): Promise<{ status: MeasureStatus; rows: Measurement[] }> {
  const { primary, secondary } = METRICS[kind];

  if (enforceCap && asset.projectId) {
    const [{ n }] = await deps.db
      .select({ n: countDistinct(measurements.assetId) })
      .from(measurements)
      .innerJoin(assets, eq(assets.id, measurements.assetId))
      .where(eq(assets.projectId, asset.projectId));
    if (n >= (deps.measureMax ?? DEFAULT_MEASURE_MAX)) return { status: "capped", rows: existing };
  }

  const rows: Array<typeof measurements.$inferInsert> = [];
  // Provenance: masks and derived frames come from the media provider; item counts from the AI.
  const media = { providerMode: deps.media.kind, provider: deps.media.kind === "real" ? "cloudinary:e_extract" : "mock:colour-index" };
  const exgProv = { providerMode: deps.media.kind, provider: deps.media.kind === "real" ? "saakshi:exg-on-cloudinary-frame" : "saakshi:exg-on-mock-frame" };
  const aiProv = { providerMode: (asset.provenance?.ai?.mode ?? "mock") as "mock" | "real", provider: `ai:${asset.ai?.model ?? "unknown"}` };
  if (kind === "litter") {
    const { maskUrl, buffer, prompts, refused } = await deps.media.extractMask(asset.cldPublicId, LITTER_PROMPTS, { multiple: true, frame: FRAME });
    rows.push({ assetId: asset.id, metric: primary, frame: FRAME_KEY, value: await maskCover(buffer), method: "measured", maskUrl, ...media, detail: { prompt: LITTER_PROMPTS, threshold: MASK_THRESHOLD, ...promptDetail(prompts, refused) } });
    const counts = (asset.ai?.visibleCounts ?? []).filter((c) => LITTER_WORDS.test(c.label));
    if (asset.ai && counts.length) {
      const confidence = Math.round(Math.min(asset.ai.confidence, ...counts.map((c) => c.confidence)) * 100) / 100;
      rows.push({ assetId: asset.id, metric: secondary, frame: FRAME_KEY, value: counts.reduce((s, c) => s + c.count, 0), method: "ai_estimated", confidence, ...aiProv, detail: { labels: counts.map((c) => c.label), model: asset.ai.model } });
    }
  } else {
    const { maskUrl, buffer, prompts, refused } = await deps.media.extractMask(asset.cldPublicId, GREEN_PROMPTS, { multiple: true, frame: FRAME });
    const mask = await maskCover(buffer);
    const exgValue = await exgCover(await deps.media.fetchDerived(asset.cldPublicId, [...FRAME, { format: "png" }]));
    const agreement = Math.round(Math.abs(mask - exgValue) * 10) / 10;
    const lowConfidence = agreement > DISAGREEMENT_POINTS;
    rows.push({ assetId: asset.id, metric: primary, frame: FRAME_KEY, value: mask, method: "measured", confidence: lowConfidence ? 0.4 : 0.9, maskUrl, ...media, detail: { prompt: GREEN_PROMPTS, threshold: MASK_THRESHOLD, exg: exgValue, agreement, lowConfidence, ...promptDetail(prompts, refused) } });
    rows.push({ assetId: asset.id, metric: secondary, frame: FRAME_KEY, value: exgValue, method: "measured", ...exgProv, detail: { index: "ExG > 0.05 at 256 px" } });
  }
  await deps.db.insert(measurements).values(rows).onConflictDoNothing();
  return { status: "measured", rows: await deps.db.select().from(measurements).where(and(eq(measurements.assetId, asset.id), eq(measurements.frame, FRAME_KEY))) };
}

/** When Cloudinary was asked prompt by prompt: which returned a mask and which it refused. */
const promptDetail = (prompts?: string[], refused?: string[]) => (refused?.length ? { maskedPrompts: prompts ?? [], refusedPrompts: refused } : {});

export interface PairContext {
  origin: Comparison["origin"];
  candidate?: PairCandidate;
  chosenBy?: string;
  note?: string;
}

/** Measures both photos (never capped: pairs are few) and upserts one comparison per metric. */
export async function measurePair(deps: MeasureDeps, project: Project, before: Asset, after: Asset, ctx: PairContext): Promise<Comparison[]> {
  const kind = measureKind(project.type);
  if (!kind) return [];
  const spot = await spotOf(deps.db, before.spotId);
  if (!spot && !ctx.candidate) return [];
  const [b, a] = await Promise.all([measureAsset(deps, before, kind, { enforceCap: false }), measureAsset(deps, after, kind, { enforceCap: false })]);
  // No comparison without two measurements: an unmeasurable photo never gets a number.
  if (b.status === "unmeasurable" || a.status === "unmeasurable") return [];
  const candidate = ctx.candidate ?? evaluatePair(pairProjectOf(project), pairSpotOf(spot!), pairPhotoOf(before), pairPhotoOf(after));
  const composite = await deps.media.composite({ publicId: before.cldPublicId, label: captureDate(before.capturedAt, before.capturedAtPrecision) }, { publicId: after.cldPublicId, label: captureDate(after.capturedAt, after.capturedAtPrecision) });
  const view = { frameBeforeUrl: deps.media.url(before.cldPublicId, VIEW, { signed: true }), frameAfterUrl: deps.media.url(after.cldPublicId, VIEW, { signed: true }) };
  const primaryOf = (rows: Measurement[]) => rows.find((r) => r.metric === METRICS[kind].primary);
  const agreement =
    kind === "green"
      ? {
          before: (primaryOf(b.rows)?.detail?.agreement as number | undefined) ?? null,
          after: (primaryOf(a.rows)?.detail?.agreement as number | undefined) ?? null,
          lowConfidence: !!(primaryOf(b.rows)?.detail?.lowConfidence || primaryOf(a.rows)?.detail?.lowConfidence),
        }
      : undefined;

  const out: Comparison[] = [];
  for (const metric of [METRICS[kind].primary, METRICS[kind].secondary]) {
    const mb = b.rows.find((r) => r.metric === metric);
    const ma = a.rows.find((r) => r.metric === metric);
    if (!mb || !ma) continue;
    const method = mb.method === "measured" && ma.method === "measured" ? "measured" : "ai_estimated";
    const confs = [mb.confidence, ma.confidence].filter((c): c is number => c !== null);
    const confidence = confs.length ? Math.min(...confs) : method === "ai_estimated" ? 0.5 : null;
    const detail: ComparisonDetail = {
      caveat: CAVEAT,
      unit: unitOf(metric),
      stageScore: candidate.stageScore,
      hamming: candidate.hamming,
      ...(metric === METRICS[kind].primary && agreement ? { agreement } : {}),
      ...view,
      ...(ctx.chosenBy ? { chosenBy: ctx.chosenBy } : {}),
      ...(ctx.note ? { note: ctx.note } : {}),
      ...(composite.mode === "server" ? { compositePublicId: composite.publicId } : {}),
    };
    const values = {
      projectId: project.id,
      spotId: before.spotId,
      beforeAssetId: before.id,
      afterAssetId: after.id,
      distanceM: Number.isFinite(candidate.distanceM) ? candidate.distanceM : null,
      gapHours: candidate.gapHours,
      metric,
      beforeValue: mb.value,
      afterValue: ma.value,
      delta: Math.round((ma.value - mb.value) * 10) / 10,
      method,
      confidence,
      maskBeforeUrl: mb.maskUrl,
      maskAfterUrl: ma.maskUrl,
      compositeUrl: composite.url,
      compositeTransforms: composite.transforms,
      origin: ctx.origin,
      providerMode: mb.providerMode === "real" && ma.providerMode === "real" ? ("real" as const) : ("mock" as const),
      detail,
    } as const;
    const [row] = await deps.db
      .insert(comparisons)
      .values(values)
      .onConflictDoUpdate({ target: [comparisons.beforeAssetId, comparisons.afterAssetId, comparisons.metric], set: { ...values, updatedAt: new Date() } })
      .returning();
    out.push(row);
  }
  return out;
}

export interface AutoPairReport {
  projectId: string;
  projectName: string;
  kind: MeasureKind | null;
  result: PairingResult;
  comparisons: number;
  removed: number;
}

/** Pairs a project's photos by the rules and measures the chosen pairs. Manual and check-in pairs are kept. */
export async function autoPairProject(deps: MeasureDeps, projectId: string): Promise<AutoPairReport> {
  const [project] = await deps.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error(`Project ${projectId} not found`);
  const kind = measureKind(project.type);
  const [photos, ss] = await Promise.all([deps.db.select().from(assets).where(eq(assets.projectId, projectId)), deps.db.select().from(spots).where(eq(spots.projectId, projectId))]);
  const result = findPairs(pairProjectOf(project), ss.map(pairSpotOf), photos.map(pairPhotoOf));
  const byId = new Map(photos.map((p) => [p.id, p]));

  // Auto pairs that are no longer chosen go (the rules or the photos changed).
  const keep = result.pairs.map((p) => `${p.beforeId}>${p.afterId}`);
  const autos = await deps.db.select({ id: comparisons.id, b: comparisons.beforeAssetId, a: comparisons.afterAssetId }).from(comparisons).where(and(eq(comparisons.projectId, projectId), eq(comparisons.origin, "auto")));
  const stale = autos.filter((c) => !keep.includes(`${c.b}>${c.a}`)).map((c) => c.id);
  if (stale.length) await deps.db.delete(comparisons).where(inArray(comparisons.id, stale));

  let n = 0;
  if (kind) for (const pair of result.pairs) n += (await measurePair(deps, project, byId.get(pair.beforeId)!, byId.get(pair.afterId)!, { origin: "auto", candidate: pair })).length;
  return { projectId, projectName: project.name, kind, result, comparisons: n, removed: stale.length };
}

export class PairError extends Error {
  constructor(
    message: string,
    readonly reasons: string[],
  ) {
    super(message);
    this.name = "PairError";
  }
}

/** A person picks the pair; the rules still apply (ordered by capture time, so input order doesn't matter). */
export async function manualPair(deps: MeasureDeps, projectId: string, ids: [string, string], { chosenBy = "user", note }: { chosenBy?: string; note?: string } = {}) {
  const [project] = await deps.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new PairError("Project not found", ["not_found"]);
  if (!measureKind(project.type)) throw new PairError(`A ${project.type} project has no before/after measurement`, ["not_measurable"]);
  const rows = await deps.db.select().from(assets).where(inArray(assets.id, ids));
  if (rows.length !== 2 || ids[0] === ids[1]) throw new PairError("Two different photos are needed", ["not_found"]);
  if (rows.some((r) => r.projectId !== projectId)) throw new PairError("Both photos must be in this project", ["different_project"]);
  const [before, after] = rows.sort((x, y) => (x.capturedAt?.getTime() ?? 0) - (y.capturedAt?.getTime() ?? 0));
  const reasons = [...exclusionsOf(pairPhotoOf(before)).map((r) => `before:${r}`), ...exclusionsOf(pairPhotoOf(after)).map((r) => `after:${r}`)];
  if (unmeasurableReason(before)) reasons.push("before:unmeasurable");
  if (unmeasurableReason(after)) reasons.push("after:unmeasurable");
  if (before.spotId !== after.spotId) reasons.push("different_spot");
  const spot = await spotOf(deps.db, before.spotId);
  if (!spot) throw new PairError("This pair breaks the pairing rules", [...new Set([...reasons, "no_spot"])]);
  const candidate = evaluatePair(pairProjectOf(project), pairSpotOf(spot), pairPhotoOf(before), pairPhotoOf(after));
  reasons.push(...candidate.rejects);
  if (reasons.length) throw new PairError("This pair breaks the pairing rules", reasons);
  return measurePair(deps, project, before, after, { origin: "manual", candidate, chosenBy, note });
}

/** Forgets cached measurements of the photos in these comparisons and measures them again. */
export async function remeasure(deps: MeasureDeps, comparisonIds: string[]) {
  const rows = await deps.db.select().from(comparisons).where(inArray(comparisons.id, comparisonIds));
  const pairs = [...new Map(rows.map((r) => [`${r.beforeAssetId}>${r.afterAssetId}`, r])).values()];
  const assetIds = [...new Set(pairs.flatMap((p) => [p.beforeAssetId, p.afterAssetId]))];
  if (assetIds.length) await deps.db.delete(measurements).where(inArray(measurements.assetId, assetIds));
  const out: Comparison[] = [];
  for (const p of pairs) {
    const [project] = await deps.db.select().from(projects).where(eq(projects.id, p.projectId));
    const [[before], [after]] = await Promise.all([
      deps.db.select().from(assets).where(eq(assets.id, p.beforeAssetId)),
      deps.db.select().from(assets).where(eq(assets.id, p.afterAssetId)),
    ]);
    out.push(...(await measurePair(deps, project, before, after, { origin: p.origin, chosenBy: p.detail?.chosenBy, note: p.detail?.note })));
  }
  return out;
}

/**
 * A spot's baseline: its best "after" photo (lib/measure/pairing.ts chooseBaseline), the state
 * later check-ins are compared with. Kept while it stays eligible, unless `force` (after a bulk
 * import, when better archive photos may have arrived later).
 */
export async function refreshBaseline(db: DB, spotId: string, { force = false } = {}): Promise<string | null> {
  const [spot] = await db.select().from(spots).where(eq(spots.id, spotId)).limit(1);
  if (!spot) return null;
  // Check-ins are compared with the baseline, so they never become it.
  const photos = (await db.select().from(assets).where(eq(assets.spotId, spotId))).filter((a) => a.id === spot.baselineAssetId || a.source !== "witness" || !spot.baselineAssetId);
  const current = photos.find((p) => p.id === spot.baselineAssetId && exclusionsOf(pairPhotoOf(p)).length === 0 && !unmeasurableReason(p));
  if (current && !force) return current.id;
  const best = chooseBaseline(photos.map((a) => ({ ...pairPhotoOf(a), score: a.trustScore })));
  if ((best?.id ?? null) !== spot.baselineAssetId) await db.update(spots).set({ baselineAssetId: best?.id ?? null }).where(eq(spots.id, spotId));
  return best?.id ?? null;
}

/** Measured photos per project (for reporting the cap). */
export async function measuredCount(db: DB, projectId: string): Promise<number> {
  const [{ n }] = await db.select({ n: countDistinct(measurements.assetId) }).from(measurements).innerJoin(assets, eq(assets.id, measurements.assetId)).where(eq(assets.projectId, projectId));
  return n;
}

export async function comparisonCount(db: DB, projectIds: string[]): Promise<number> {
  if (!projectIds.length) return 0;
  const [{ n }] = await db.select({ n: count() }).from(comparisons).where(inArray(comparisons.projectId, projectIds));
  return n;
}

