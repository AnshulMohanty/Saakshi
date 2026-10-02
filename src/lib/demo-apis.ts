/**
 * Data behind the Phase 7 surfaces (Witness Wall, landing counters, 3D evidence viewer, the
 * tamper demo, "Try to fool it"). Plain functions over the DB and media provider; the API routes
 * are thin wrappers, so tests exercise these directly.
 */
import { and, count, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { DB } from "./db/client";
import { assets, comparisons, measurements, projects, spots } from "./db/schema";
import { uuidv5, DEMO_NAMESPACE } from "./demo/common";
import { heroProject } from "./demo/hero";
import { ensureQr, locationOf } from "./evidence";
import { PREVIEW } from "./library";
import { captureDate, shortDate } from "./media/composite";
import { proofStripTransform } from "./media/proof";
import { linkChips, withoutChips } from "./media/link-chips";
import { compileTransform, type Transform, type TransformStep } from "./media/transform";
import type { PipelineDeps } from "./pipeline/steps";
import { runPipeline } from "./pipeline/runner";
import type { MediaProvider } from "./providers/media";
import { describeReason } from "./trust";
import { assetMode, HIDDEN_MOCK, hidesMock, numberPolicy, type DisplayPolicy, type ProviderMode } from "./provenance";

/** A measured value under the display policy: withheld (production + mock) or tagged (development + mock). */
function shownValue(value: number, mode: ProviderMode, policy: DisplayPolicy) {
  const p = numberPolicy(mode, policy);
  return p === "hide" ? { value: null, hiddenText: HIDDEN_MOCK, providerMode: mode } : { value, providerMode: mode, mock: p === "tag" };
}

// --- /api/stats ---------------------------------------------------------------------------------

/** Start of "today" in India (UTC+05:30), as a UTC instant. */
export function startOfIstDay(now = new Date()): Date {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
}

/**
 * Counters from SQL. Photo, spot and project counts are plain row counts. Verified, flagged and
 * pairs rest on provider output: in production they count only real-provider rows (a mock-derived
 * number never ships); in development they count everything and say how many are mock-derived.
 */
export async function stats(db: DB, now = new Date(), policy: DisplayPolicy = { production: false, minConfidence: 0.5 }) {
  const n = async (q: Promise<Array<{ n: number }>>) => (await q)[0].n;
  const real = sql`${assets.provenance}->'analysis'->>'mode' = 'real' and ${assets.provenance}->'ai'->>'mode' = 'real'`;
  const [photos, verifiedAll, flaggedAll, verifiedReal, flaggedReal, spotsN, witnessToday, projectsN, pairsAll, pairsReal] = await Promise.all([
    n(db.select({ n: count() }).from(assets)),
    n(db.select({ n: count() }).from(assets).where(eq(assets.trustBand, "VERIFIED"))),
    n(db.select({ n: count() }).from(assets).where(eq(assets.trustBand, "FLAGGED"))),
    n(db.select({ n: count() }).from(assets).where(and(eq(assets.trustBand, "VERIFIED"), real))),
    n(db.select({ n: count() }).from(assets).where(and(eq(assets.trustBand, "FLAGGED"), real))),
    n(db.select({ n: count() }).from(spots)),
    n(db.select({ n: count() }).from(assets).where(and(eq(assets.source, "witness"), gte(assets.createdAt, startOfIstDay(now))))),
    n(db.select({ n: count() }).from(projects)),
    n(db.select({ n: count() }).from(comparisons).where(isNotNull(comparisons.maskBeforeUrl))),
    n(db.select({ n: count() }).from(comparisons).where(and(isNotNull(comparisons.maskBeforeUrl), eq(comparisons.providerMode, "real")))),
  ]);
  const hero = await heroProject(db);
  const mockDerived = { verified: verifiedAll - verifiedReal, flagged: flaggedAll - flaggedReal, pairs: pairsAll - pairsReal };
  return {
    photos,
    verified: hidesMock(policy) ? verifiedReal : verifiedAll,
    flagged: hidesMock(policy) ? flaggedReal : flaggedAll,
    spots: spotsN,
    witnessToday,
    projects: projectsN,
    pairs: hidesMock(policy) ? pairsReal : pairsAll,
    /** Development only: how many of the counts above rest on mock providers ("Mock output"). */
    ...(hidesMock(policy) ? {} : { mockDerived }),
    hero: hero.project ? { slug: hero.slug, name: hero.project.name } : null,
    at: now.toISOString(),
  };
}

// --- /api/assets/[id]/layers ----------------------------------------------------------------------

/** Everything the 3D evidence viewer stacks: photo, capture facts, pHash bits, tags, mask, trust, proof strip. */
export async function assetLayers(db: DB, media: MediaProvider, id: string, appUrl: string, policy: DisplayPolicy = { production: false, minConfidence: 0.5 }) {
  const [a] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!a) return null;
  const ms = await db.select().from(measurements).where(eq(measurements.assetId, a.id));
  const mask = ms.find((m) => m.maskUrl);
  await ensureQr(media, a.id, appUrl);
  const date = a.capturedAt ? captureDate(a.capturedAt, a.capturedAtPrecision) : shortDate(a.uploadedAt);
  const proof = proofStripTransform({ assetId: a.id, place: a.placeName, date, band: a.trustBand });
  const bits = a.phash ? BigInt(`0x${a.phash}`).toString(2).padStart(64, "0").split("").map(Number) : null;
  return {
    id: a.id,
    photo: { url: media.url(a.cldPublicId, PREVIEW, { signed: true }), width: a.width, height: a.height },
    capture: {
      capturedAt: a.capturedAt?.toISOString() ?? null,
      tzAssumed: a.capturedAtTzAssumed,
      uploadedAt: a.uploadedAt.toISOString(),
      location: locationOf(a),
      place: a.placeName,
      camera: [a.cameraMake, a.cameraModel].filter(Boolean).join(" ") || null,
      source: a.source,
      attestation: a.capture ? { attested: a.capture.attested, clientCapturedAt: a.capture.clientCapturedAt, ticketIssuedAt: a.capture.ticketIssuedAt, serverReceivedAt: a.capture.serverReceivedAt } : null,
    },
    phash: a.phash ? { hex: a.phash, bits } : null,
    ai: {
      tags: a.cldTags,
      activity: a.ai?.activity ?? null,
      stage: a.ai?.stage ?? null,
      visibleCounts: a.ai?.visibleCounts ?? [],
      /** Region boxes: none yet (the vision model returns counts, not boxes). */
      regions: [] as Array<{ label: string; box: [number, number, number, number] }>,
      method: "ai_estimated" as const,
    },
    mask: mask ? { url: mask.maskUrl, metric: mask.metric, ...shownValue(mask.value, mask.providerMode, policy) } : null,
    trust: (() => {
      const mode = assetMode(a.provenance);
      const p = numberPolicy(mode, policy);
      return p === "hide"
        ? { score: null, band: null, reasons: [], providerMode: mode, hiddenText: HIDDEN_MOCK }
        : { score: a.trustScore, band: a.trustBand, reasons: (a.trustReasons ?? []).map((r) => ({ ...r, sentence: describeReason(r) })), providerMode: mode, mock: p === "tag" };
    })(),
    proofStrip: { url: media.url(a.cldPublicId, proof, { signed: true }), place: a.placeName, date, band: a.trustBand, evidenceUrl: `${appUrl}/e/${a.id}` },
  };
}

// --- /api/demo/tamper -------------------------------------------------------------------------------

const stepName = (s: TransformStep) => ("effect" in s ? s.effect : "overlay" in s ? "overlay" : "format" in s || "quality" in s ? "delivery" : "raw" in s ? "raw" : "resize");

/**
 * Builds the signed preview URL, then the same URL with one step removed but the original
 * signature kept. Fetching both shows the point: the edit breaks the signature (401).
 */
export async function tamperDemo(media: MediaProvider, publicId: string, remove: string, fetchStatus: (url: string) => Promise<number>, transform: Transform = PREVIEW) {
  const original = media.url(publicId, transform, { signed: true });
  const kept = transform.filter((s) => stepName(s) !== remove);
  if (kept.length === transform.length) return { error: `No "${remove}" step in the transform ${compileTransform(transform)}` } as const;
  const from = compileTransform(transform);
  const to = compileTransform(kept);
  if (!original.includes(`/${from}/`)) return { error: "Unexpected URL shape" } as const;
  const tampered = original.replace(`/${from}/`, `/${to}/`);
  const [originalStatus, tamperedStatus] = await Promise.all([fetchStatus(original), fetchStatus(tampered)]);
  return { originalStatus, tamperedStatus, removed: remove, urls: { original, tampered } } as const;
}

/**
 * B5.6: the landing's link with any chips removed (signature, crop, blur faces, format; the
 * photo stays), the original signature kept unless it is the chip removed. Both links are
 * requested server-side and the real statuses returned.
 */
export async function tamperChips(media: MediaProvider, publicId: string, remove: string[], fetchStatus: (url: string) => Promise<number>, transform: Transform = PREVIEW) {
  const original = media.url(publicId, transform, { signed: true });
  const parsed = linkChips(original);
  if (!parsed) return { error: "Unexpected URL shape" } as const;
  const known = new Set(parsed.chips.filter((c) => c.removable).map((c) => c.k));
  const removed = remove.filter((k) => known.has(k));
  const edited = withoutChips(original, removed);
  const [originalStatus, status] = await Promise.all([fetchStatus(original), removed.length ? fetchStatus(edited) : null]);
  return { originalStatus, status: status ?? originalStatus, removed, chips: parsed.chips.map((c) => c.k) } as const;
}

// --- /api/demo/try (P1) -----------------------------------------------------------------------------

export const SANDBOX_SLUG = "try-to-fool-it";
export const sandboxProjectId = () => uuidv5(`project:${SANDBOX_SLUG}`, DEMO_NAMESPACE);
export const SANDBOX_TTL_MS = 24 * 3_600_000;

export interface SandboxOptions {
  /** The stage venue (STAGE_LAT/STAGE_LNG): the sandbox's site. Without it nothing can be verified. */
  venue?: { lat: number; lng: number } | null;
  now?: Date;
}

export const SANDBOX_RADIUS_M = 300;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The configured venue, if any. */
export function sandboxVenue(env: { STAGE_LAT?: number; STAGE_LNG?: number }): { lat: number; lng: number } | null {
  return env.STAGE_LAT !== undefined && env.STAGE_LNG !== undefined ? { lat: env.STAGE_LAT, lng: env.STAGE_LNG } : null;
}

/** The sandbox project: the stage venue, 300 m, today ± 1 day when a venue is set; otherwise no site. */
export async function ensureSandbox(db: DB, { venue = null, now = new Date() }: SandboxOptions = {}): Promise<string> {
  const id = sandboxProjectId();
  const values = {
    name: "Try to fool it",
    slug: SANDBOX_SLUG,
    type: "other" as const,
    description: venue
      ? "Sandbox at the stage venue: upload any image and see what the Trust Engine makes of it. A photo taken here today with camera GPS can be verified; an internet image cannot. Photos are deleted after 24 hours."
      : "Sandbox with no site set, so nothing here can be verified. Photos are deleted after 24 hours.",
    source: "user" as const,
    centerLat: venue?.lat ?? null,
    centerLng: venue?.lng ?? null,
    radiusM: venue ? SANDBOX_RADIUS_M : null,
    startDate: venue ? dayOf(now.getTime() - 86_400_000) : null,
    endDate: venue ? dayOf(now.getTime() + 86_400_000) : null,
    monitoringEndsAt: venue ? dayOf(now.getTime() + 86_400_000) : null,
  };
  await db.insert(projects).values({ id, ...values }).onConflictDoUpdate({ target: projects.id, set: values });
  return id;
}

/** Deletes sandbox photos older than 24 h (their audit chains go with them). */
export async function sweepSandbox(db: DB, media: MediaProvider, now = new Date()): Promise<number> {
  const old = await db
    .select({ id: assets.id, publicId: assets.cldPublicId })
    .from(assets)
    .where(and(eq(assets.projectId, sandboxProjectId()), lt(assets.createdAt, new Date(now.getTime() - SANDBOX_TTL_MS))));
  for (const a of old) {
    await db.delete(assets).where(eq(assets.id, a.id));
    await media.destroy(a.publicId).catch(() => undefined);
  }
  if (old.length) await appendAudit(db, { assetId: null, actor: "sandbox", action: "sandbox.swept", detail: { deleted: old.length } });
  return old.length;
}

/** Uploads an image into the sandbox, runs the whole pipeline now, returns its trust ledger. */
export async function tryToFoolIt(deps: PipelineDeps, file: Buffer, filename: string, appUrl: string, opts: SandboxOptions = {}) {
  await sweepSandbox(deps.db, deps.media);
  const projectId = await ensureSandbox(deps.db, opts);
  const up = await deps.media.upload({ file, folder: "saakshi/sandbox", tags: ["saakshi", "sandbox"], context: { filename: filename.slice(0, 120) } });
  const [row] = await deps.db
    .insert(assets)
    .values({
      source: "upload",
      cldPublicId: up.publicId,
      cldAssetId: up.assetId,
      etag: up.etag,
      phash: up.phash,
      width: up.width,
      height: up.height,
      facesCount: up.facesCount,
      qualityScore: up.qualityScore,
      pipeline: { ingest: { mediaMetadata: up.mediaMetadata, hint: { projectId } }, steps: {} },
    })
    .returning();
  await appendAudit(deps.db, { assetId: row.id, actor: "sandbox", action: "sandbox.uploaded", detail: { filename: filename.slice(0, 120) } });
  await runPipeline(deps, row.id);
  const [a] = await deps.db.select().from(assets).where(eq(assets.id, row.id));
  return {
    id: a.id,
    score: a.trustScore,
    band: a.trustBand,
    reasons: (a.trustReasons ?? []).map((r) => ({ code: r.code, signal: r.signal, kind: r.kind, points: r.points, sentence: describeReason(r) })),
    phash: a.phash,
    evidenceUrl: `${appUrl}/e/${a.id}`,
    note: opts.venue
      ? "The sandbox site is the stage venue (300 m, today ± 1 day). A genuine photo taken here with camera GPS can reach Verified; an internet image cannot."
      : "No site set, so nothing here can be verified.",
    site: opts.venue ? { ...opts.venue, radiusM: SANDBOX_RADIUS_M } : null,
    expiresAt: new Date(a.createdAt.getTime() + SANDBOX_TTL_MS).toISOString(),
  };
}
