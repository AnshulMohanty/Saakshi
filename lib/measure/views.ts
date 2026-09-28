/**
 * Read models for the project page, the public spot page and its poster. Every image URL is
 * signed and face-blurred; values come only from stored measurements and comparisons.
 */
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import type { DB } from "../db/client";
import { assets, comparisons, measurements, projects, spots, type CapturePrecision, type Comparison, type MetricId } from "../db/schema";
import { THUMB } from "../library";
import { captureDate } from "../media/composite";
import type { MediaProvider } from "../providers/media";
import { CAVEAT, FRAME_KEY, METRIC_LABEL, METRICS, measureKind, pairPhotoOf, unitOf } from "./measure";
import { exclusionsOf } from "./pairing";
import { combineModes, HIDDEN_MOCK, numberPolicy, showEstimate, showNumber, type DisplayPolicy } from "../provenance";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ComparisonCard {
  key: string;
  origin: Comparison["origin"];
  spot: { name: string; slug: string | null } | null;
  distanceM: number | null;
  gapHours: number | null;
  before: { id: string; date: string; viewUrl: string; maskUrl: string | null };
  after: { id: string; date: string; viewUrl: string; maskUrl: string | null };
  compositeUrl: string | null;
  metrics: Array<{
    metric: MetricId;
    label: string;
    unit: "%" | "items";
    before: number;
    after: number;
    delta: number;
    method: "measured" | "ai_estimated";
    confidence: number | null;
    /** Set when the display policy withholds the number (mock in production, low-confidence estimate). */
    hiddenText: string | null;
    mock: boolean;
  }>;
  lowConfidence: boolean;
  caveat: string;
  note: string | null;
}

export async function projectView(db: DB, media: MediaProvider, idOrSlug: string, policy: DisplayPolicy = { production: false, minConfidence: 0.5 }) {
  const [project] = await db
    .select()
    .from(projects)
    .where(UUID.test(idOrSlug) ? eq(projects.id, idOrSlug) : eq(projects.slug, idOrSlug))
    .limit(1);
  if (!project) return null;
  const [ss, photos, cs] = await Promise.all([
    db.select().from(spots).where(eq(spots.projectId, project.id)).orderBy(asc(spots.name)),
    db
      .select({ id: assets.id, band: assets.trustBand, status: assets.status, spotId: assets.spotId, capturedAt: assets.capturedAt, source: assets.source })
      .from(assets)
      .where(eq(assets.projectId, project.id)),
    db.select().from(comparisons).where(eq(comparisons.projectId, project.id)).orderBy(asc(comparisons.origin), desc(comparisons.updatedAt)),
  ]);
  const ids = [...new Set(cs.flatMap((c) => [c.beforeAssetId, c.afterAssetId]))];
  const dated = ids.length ? await db.select({ id: assets.id, capturedAt: assets.capturedAt, precision: assets.capturedAtPrecision }).from(assets).where(inArray(assets.id, ids)) : [];
  const dateOf = new Map(dated.map((a) => [a.id, captureDate(a.capturedAt, a.precision)]));
  const spotOf = new Map(ss.map((s) => [s.id, s]));

  const cards = new Map<string, ComparisonCard>();
  for (const c of cs) {
    const key = `${c.beforeAssetId}>${c.afterAssetId}`;
    const card =
      cards.get(key) ??
      ({
        key,
        origin: c.origin,
        spot: c.spotId && spotOf.get(c.spotId) ? { name: spotOf.get(c.spotId)!.name, slug: spotOf.get(c.spotId)!.slug } : null,
        distanceM: c.distanceM,
        gapHours: c.gapHours,
        before: { id: c.beforeAssetId, date: dateOf.get(c.beforeAssetId) ?? "", viewUrl: c.detail?.frameBeforeUrl ?? "", maskUrl: null },
        after: { id: c.afterAssetId, date: dateOf.get(c.afterAssetId) ?? "", viewUrl: c.detail?.frameAfterUrl ?? "", maskUrl: null },
        compositeUrl: c.compositeUrl,
        metrics: [],
        lowConfidence: false,
        caveat: c.detail?.caveat ?? CAVEAT,
        note: c.detail?.note ?? null,
      } satisfies ComparisonCard);
    const primary = c.maskBeforeUrl !== null;
    if (primary && !card.before.maskUrl) {
      card.before.maskUrl = c.maskBeforeUrl;
      card.after.maskUrl = c.maskAfterUrl;
    }
    card.lowConfidence ||= !!c.detail?.agreement?.lowConfidence;
    const shown = c.method === "ai_estimated" ? showEstimate(c.delta ?? 0, c.confidence, c.providerMode, policy) : showNumber(c.delta ?? 0, c.providerMode, policy);
    card.metrics.push({
      hiddenText: shown?.kind === "hidden" ? shown.text : null,
      mock: shown?.kind === "value" && shown.mock,
      metric: c.metric as MetricId,
      label: METRIC_LABEL[c.metric as MetricId] ?? c.metric,
      unit: unitOf(c.metric as MetricId),
      before: c.beforeValue ?? 0,
      after: c.afterValue ?? 0,
      delta: c.delta ?? 0,
      method: c.method,
      confidence: c.confidence,
    });
    cards.set(key, card);
  }
  const kind = measureKind(project.type);
  const order: MetricId[] = kind ? [METRICS[kind].primary, METRICS[kind].secondary] : [];
  for (const card of cards.values()) card.metrics.sort((a, b) => order.indexOf(a.metric) - order.indexOf(b.metric));

  const bands: Record<string, number> = { VERIFIED: 0, NEEDS_REVIEW: 0, FLAGGED: 0 };
  for (const p of photos) if (p.band) bands[p.band]++;
  const { embedding: _e, ...rest } = project;
  void _e;
  return {
    project: rest,
    kind,
    photos: photos.length,
    bands,
    spots: ss.map((s) => ({ id: s.id, name: s.name, slug: s.slug, radiusM: s.radiusM, photos: photos.filter((p) => p.spotId === s.id).length })),
    cards: [...cards.values()],
    caveat: CAVEAT,
  };
}

export type ProjectView = NonNullable<Awaited<ReturnType<typeof projectView>>>;

/** One measured photo at the spot. */
export interface TrendPoint {
  /** Capture time, epoch ms (the chart's x axis). */
  t: number;
  label: string;
  value: number;
  assetId: string;
  source: string;
  /** How precisely the capture time is known (the tooltip says "date only" when coarse). */
  precision: CapturePrecision | null;
}

export async function spotView(db: DB, media: MediaProvider, slug: string, policy: DisplayPolicy = { production: false, minConfidence: 0.5 }) {
  const [spot] = await db
    .select()
    .from(spots)
    .where(UUID.test(slug) ? or(eq(spots.id, slug), eq(spots.slug, slug)) : eq(spots.slug, slug))
    .limit(1);
  if (!spot) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, spot.projectId)).limit(1);
  const kind = measureKind(project.type);
  const photos = (await db.select().from(assets).where(eq(assets.spotId, spot.id)).orderBy(desc(assets.capturedAt))).filter((a) => exclusionsOf(pairPhotoOf(a)).length === 0);
  const metric = kind ? METRICS[kind].primary : null;
  const ms = metric && photos.length
    ? await db.select().from(measurements).where(and(inArray(measurements.assetId, photos.map((p) => p.id)), eq(measurements.metric, metric), eq(measurements.frame, FRAME_KEY)))
    : [];
  const trend: TrendPoint[] = ms
    .map((m) => {
      const a = photos.find((p) => p.id === m.assetId)!;
      return { t: a.capturedAt!.getTime(), label: captureDate(a.capturedAt, a.capturedAtPrecision), value: m.value, assetId: a.id, source: a.source, precision: a.capturedAtPrecision ?? null };
    })
    .sort((x, y) => x.t - y.t || x.assetId.localeCompare(y.assetId));
  const trendPolicy = numberPolicy(combineModes(ms.map((m) => m.providerMode)), policy);
  const baseline = photos.find((p) => p.id === spot.baselineAssetId) ?? null;
  const pin = (a: (typeof photos)[number]) => {
    const fix = a.source === "witness" ? a.capture?.deviceFix : null;
    return fix ? { lat: fix.lat, lng: fix.lng } : a.exifLat !== null && a.exifLng !== null ? { lat: a.exifLat, lng: a.exifLng } : null;
  };
  return {
    spot: { id: spot.id, name: spot.name, slug: spot.slug, lat: spot.lat, lng: spot.lng, radiusM: spot.radiusM },
    project: { id: project.id, name: project.name, slug: project.slug, type: project.type, locationApproximate: project.locationApproximate },
    metric: metric ? { id: metric, label: METRIC_LABEL[metric], unit: unitOf(metric) } : null,
    // Mock-derived measurements never ship: no trend in production until real masks exist.
    trend: trendPolicy === "hide" ? [] : trend,
    trendHidden: trendPolicy === "hide" && trend.length > 0 ? HIDDEN_MOCK : null,
    trendMock: trendPolicy === "tag",
    baseline: baseline ? { id: baseline.id, date: captureDate(baseline.capturedAt, baseline.capturedAtPrecision), thumbUrl: media.url(baseline.cldPublicId, THUMB, { signed: true }) } : null,
    latest: photos.slice(0, 12).map((a) => ({ id: a.id, date: captureDate(a.capturedAt, a.capturedAtPrecision), source: a.source, thumbUrl: media.url(a.cldPublicId, THUMB, { signed: true }), location: pin(a) })),
    photos: photos.length,
    checkinPath: `/capture?spot=${encodeURIComponent(spot.slug ?? spot.id)}`,
    caveat: CAVEAT,
  };
}

export type SpotView = NonNullable<Awaited<ReturnType<typeof spotView>>>;
