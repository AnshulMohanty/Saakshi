/**
 * Trust scoring against the database. Gathers an asset's signals and near-duplicates, runs the
 * pure engine (lib/trust), and writes the result back: the asset row, duplicates (both ways),
 * Cloudinary metadata and tags, and an audit row. Used by the pipeline's score step and by
 * re-scoring (a project's dates or radius change, a new near-duplicate arrives).
 */
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { appendAudit } from "../audit";
import type { DB } from "../db/client";
import { assets, duplicates, projects, spots, type Asset, type NewAsset, type Project, type Spot } from "../db/schema";
import type { MediaProvider } from "../providers/media";
import { findMatches, scoreAsset, type DuplicateMatch, type TrustBand, type TrustProject, type TrustResult, type TrustSignals, type TrustSpot } from "../trust";

export const TRUST_ACTOR = "trust-engine";
export const BAND_TAGS: Record<TrustBand, string> = { VERIFIED: "trust_verified", NEEDS_REVIEW: "trust_needs_review", FLAGGED: "trust_flagged" };

type Status = Asset["status"];

/** A reviewer's decision sticks; otherwise VERIFIED is ready and everything else waits in review. */
export function statusFor(band: TrustBand | null, current: Status): Status {
  if (current === "approved" || current === "rejected") return current;
  if (!band) return current;
  return band === "VERIFIED" ? "ready" : "flagged";
}

export function signalsOf(a: Asset): TrustSignals {
  const fix = a.capture?.deviceFix ?? null;
  const up = a.capture?.uploaderLocation ?? null;
  return {
    assetId: a.id,
    source: a.source,
    exifSource: a.exifSource,
    deviceFix: fix ? { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM } : null,
    attested: a.capture?.attested ?? false,
    exifLocation: a.exifLat !== null && a.exifLng !== null ? { lat: a.exifLat, lng: a.exifLng } : null,
    uploaderLocation: up ? { lat: up.lat, lng: up.lng } : null,
    capturedAt: a.capturedAt?.toISOString() ?? null,
    capturedAtTzAssumed: a.capturedAtTzAssumed,
    capturedAtPrecision: a.capturedAtPrecision,
    uploadedAt: a.uploadedAt.toISOString(),
    moderation: a.moderation?.answers ?? null,
    watermark: a.watermark,
    textInImage: a.ai?.textInImage ?? null,
    childrenVisible: a.ai?.childrenVisible ?? false,
    qualityScore: a.qualityScore,
    cameraMake: a.cameraMake,
    cameraModel: a.cameraModel,
  };
}

export function trustProjectOf(p: Project): TrustProject {
  return {
    id: p.id,
    name: p.name,
    center: p.centerLat !== null && p.centerLng !== null ? { lat: p.centerLat, lng: p.centerLng } : null,
    radiusM: p.radiusM,
    startDate: p.startDate,
    endDate: p.endDate,
    monitoringEndsAt: p.monitoringEndsAt,
    minPairGapHours: p.minPairGapHours,
  };
}

export const trustSpotOf = (s: Spot): TrustSpot => ({ id: s.id, name: s.name, center: { lat: s.lat, lng: s.lng }, radiusM: s.radiusM });

export interface TrustComputation {
  result: TrustResult;
  matches: DuplicateMatch[];
}

/** Reads what scoring needs and runs the pure engine. No writes. */
export async function computeTrust(db: DB, asset: Asset): Promise<TrustComputation> {
  const [[project], [spot], candidates, names] = await Promise.all([
    asset.projectId ? db.select().from(projects).where(eq(projects.id, asset.projectId)).limit(1) : Promise.resolve([]),
    asset.spotId ? db.select().from(spots).where(eq(spots.id, asset.spotId)).limit(1) : Promise.resolve([]),
    db
      .select({ id: assets.id, projectId: assets.projectId, spotId: assets.spotId, phash: assets.phash, etag: assets.etag, capturedAt: assets.capturedAt, capturedAtPrecision: assets.capturedAtPrecision, uploadedAt: assets.uploadedAt })
      .from(assets)
      .where(and(ne(assets.id, asset.id), or(isNotNull(assets.phash), isNotNull(assets.etag)))),
    db.select({ id: projects.id, name: projects.name }).from(projects),
  ]);
  const nameOf = new Map(names.map((p) => [p.id, p.name]));
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  const matches = findMatches(
    { id: asset.id, projectId: asset.projectId, spotId: asset.spotId, phash: asset.phash, etag: asset.etag, capturedAt: iso(asset.capturedAt), capturedAtPrecision: asset.capturedAtPrecision, uploadedAt: asset.uploadedAt.toISOString() },
    candidates.map((c) => ({ ...c, capturedAt: iso(c.capturedAt), uploadedAt: c.uploadedAt.toISOString() })),
    (id) => (id ? (nameOf.get(id) ?? null) : null),
  );
  const result = scoreAsset(signalsOf(asset), project ? trustProjectOf(project) : null, spot ? trustSpotOf(spot) : null, matches);
  return { result, matches };
}

/** Replaces every duplicates row involving the asset, written both ways. */
export async function writeDuplicates(tx: DB, assetId: string, matches: DuplicateMatch[]): Promise<void> {
  await tx.delete(duplicates).where(or(eq(duplicates.assetId, assetId), eq(duplicates.matchAssetId, assetId)));
  if (!matches.length) return;
  const rows = matches.flatMap((m) => {
    const shared = { hamming: m.hamming, exact: m.exact, sameProject: m.sameProject, sameSpot: m.sameSpot, gapHours: m.gapHours };
    return [
      { ...shared, assetId, matchAssetId: m.assetId, matchIsLater: m.otherIsLater },
      { ...shared, assetId: m.assetId, matchAssetId: assetId, matchIsLater: !m.otherIsLater },
    ];
  });
  await tx.insert(duplicates).values(rows).onConflictDoNothing();
}

export function trustPatch(result: TrustResult, current: Status): Partial<NewAsset> {
  return {
    trustScore: result.score,
    trustBand: result.band,
    trustReasons: result.reasons,
    scoredAt: new Date(),
    status: statusFor(result.band, current),
  };
}

/** Cloudinary write-back: contextual metadata plus exactly one band tag. */
export async function writeBack(media: MediaProvider, asset: Asset, result: TrustResult): Promise<Record<string, string>> {
  const fields: Record<string, string> = { source: asset.source, trust_score: String(result.score), trust_band: result.band };
  if (asset.projectId) fields.project_id = asset.projectId;
  if (asset.capturedAt) fields.captured_at = asset.capturedAt.toISOString();
  const tag = BAND_TAGS[result.band];
  await media.updateMetadata(asset.cldPublicId, fields, {
    tags: ["saakshi", ...asset.cldTags, tag],
    removeTags: Object.values(BAND_TAGS).filter((t) => t !== tag),
  });
  return fields;
}

/** Compact audit detail for a trust result. */
export const trustAuditDetail = (r: TrustResult) => ({
  score: r.score,
  band: r.band,
  hardFlags: r.hardFlags,
  reviewFlags: r.reviewFlags,
  reasons: r.reasons.map((x) => `${x.code}:${x.points}`),
});

const signature = (r: { score: number | null; band: string | null; reasons: { code: string; points: number }[] | null }) =>
  `${r.score}|${r.band}|${(r.reasons ?? []).map((x) => `${x.code}:${x.points}`).join(",")}`;

export interface RescoreOutcome {
  assetId: string;
  changed: boolean;
  before: { score: number | null; band: TrustBand | null };
  after: { score: number; band: TrustBand };
}

/**
 * Re-scores an asset that has already been scored (assets still in the pipeline are skipped:
 * their own score step will see the current state). Duplicates are always refreshed; the row,
 * metadata and audit are written only when the result changed.
 */
export async function rescoreAsset(db: DB, media: MediaProvider, assetId: string, why: string): Promise<RescoreOutcome | null> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!asset || asset.pipeline.steps.score?.status !== "done") return null;
  const { result, matches } = await computeTrust(db, asset);
  const changed = signature({ score: asset.trustScore, band: asset.trustBand, reasons: asset.trustReasons }) !== signature(result);
  await db.transaction(async (tx) => {
    await writeDuplicates(tx as unknown as DB, asset.id, matches);
    if (!changed) return;
    await tx.update(assets).set(trustPatch(result, asset.status)).where(eq(assets.id, asset.id));
    await appendAudit(tx as unknown as DB, {
      assetId: asset.id,
      actor: TRUST_ACTOR,
      action: "trust.rescore",
      detail: { why, before: { score: asset.trustScore, band: asset.trustBand }, ...trustAuditDetail(result) },
    });
  });
  if (changed) await writeBack(media, asset, result);
  return { assetId, changed, before: { score: asset.trustScore, band: asset.trustBand }, after: { score: result.score, band: result.band } };
}

/** Re-scores the asset's matches (both directions), e.g. after it was scored or reassigned. */
export async function rescoreMatches(db: DB, media: MediaProvider, assetId: string, matchIds: string[], why: string) {
  const linked = await db
    .select({ id: duplicates.matchAssetId })
    .from(duplicates)
    .where(eq(duplicates.assetId, assetId));
  const ids = [...new Set([...matchIds, ...linked.map((l) => l.id)])].filter((id) => id !== assetId);
  const out: RescoreOutcome[] = [];
  for (const id of ids) {
    const r = await rescoreAsset(db, media, id, why);
    if (r) out.push(r);
  }
  return out;
}

/** Re-scores every scored asset in a project (its dates, radius or centre changed). */
export async function rescoreProject(db: DB, media: MediaProvider, projectId: string, why: string) {
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), isNotNull(assets.trustScore)))
    .orderBy(sql`${assets.capturedAt} asc nulls last`, assets.id);
  const out: RescoreOutcome[] = [];
  for (const { id } of rows) {
    const r = await rescoreAsset(db, media, id, why);
    if (r) out.push(r);
  }
  return { rescored: out.length, changed: out.filter((r) => r.changed).length, outcomes: out };
}


/** Re-scores every scored asset, oldest first (settles results after concurrent imports). */
/** Every scored photo, oldest first. `log` gets a progress line every 10 photos (long runs aren't silent). */
export async function rescoreAll(db: DB, media: MediaProvider, why: string, log?: (m: string) => void) {
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(isNotNull(assets.trustScore))
    .orderBy(sql`${assets.capturedAt} asc nulls last`, assets.id);
  let changed = 0;
  let i = 0;
  for (const { id } of rows) {
    if ((await rescoreAsset(db, media, id, why))?.changed) changed++;
    if (++i % 10 === 0 && i < rows.length) log?.(`  re-scored ${i} of ${rows.length} (${changed} changed)`);
  }
  return { rescored: rows.length, changed };
}

export interface TrustSummary {
  /** Archive photos by band ("unscored" while still in the pipeline). */
  bands: Record<string, number>;
  /** Most common non-positive reasons and flags on archive photos. */
  topReasons: Array<{ code: string; kind: string; n: number }>;
  /** Archive photos with a hard flag (should be none: archive photos are inside their site). */
  hardFlagged: Array<{ id: string; externalId: string | null; codes: string[] }>;
  planted: Array<{ testCase: string; band: string | null; score: number | null; hardFlags: string[] }>;
}

export async function trustSummary(db: DB): Promise<TrustSummary> {
  const rows = await db
    .select({ id: assets.id, source: assets.source, externalId: assets.externalId, testCase: assets.testCase, band: assets.trustBand, score: assets.trustScore, reasons: assets.trustReasons })
    .from(assets)
    .where(or(eq(assets.source, "archive"), eq(assets.source, "planted_test")));
  const archive = rows.filter((r) => r.source === "archive");
  const bands: Record<string, number> = { VERIFIED: 0, NEEDS_REVIEW: 0, FLAGGED: 0 };
  const reasons = new Map<string, { code: string; kind: string; n: number }>();
  for (const r of archive) {
    const key = r.band ?? "unscored";
    bands[key] = (bands[key] ?? 0) + 1;
    for (const x of r.reasons ?? []) {
      if (x.kind === "points" && x.points > 0) continue;
      if (x.kind === "info" && x.code === "PRIVACY_CHILDREN") continue;
      const e = reasons.get(x.code) ?? { code: x.code, kind: x.kind, n: 0 };
      e.n++;
      reasons.set(x.code, e);
    }
  }
  const hard = (r: (typeof rows)[number]) => (r.reasons ?? []).filter((x) => x.kind === "hard").map((x) => x.code);
  return {
    bands,
    topReasons: [...reasons.values()].sort((a, b) => b.n - a.n || a.code.localeCompare(b.code)).slice(0, 10),
    hardFlagged: archive.filter((r) => hard(r).length).map((r) => ({ id: r.id, externalId: r.externalId, codes: hard(r) })),
    planted: rows
      .filter((r) => r.source === "planted_test")
      .map((r) => ({ testCase: r.testCase ?? "?", band: r.band, score: r.score, hardFlags: hard(r) }))
      .sort((a, b) => a.testCase.localeCompare(b.testCase)),
  };
}
