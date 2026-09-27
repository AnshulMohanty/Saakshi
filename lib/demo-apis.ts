/**
 * Data behind the Phase 7 surfaces (Witness Wall, landing counters, 3D evidence viewer, the
 * tamper demo, "Try to fool it"). Plain functions over the DB and media provider; the API routes
 * are thin wrappers, so tests exercise these directly.
 */
import { and, count, eq, gte, isNotNull, lt } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { DB } from "./db/client";
import { assets, comparisons, measurements, projects, spots } from "./db/schema";
import { uuidv5, DEMO_NAMESPACE } from "./demo/common";
import { ensureQr, locationOf } from "./evidence";
import { PREVIEW } from "./library";
import { shortDate } from "./media/composite";
import { proofStripTransform } from "./media/proof";
import { compileTransform, type Transform, type TransformStep } from "./media/transform";
import type { PipelineDeps } from "./pipeline/steps";
import { runPipeline } from "./pipeline/runner";
import type { MediaProvider } from "./providers/media";
import { describeReason } from "./trust";

// --- /api/stats ---------------------------------------------------------------------------------

/** Start of "today" in India (UTC+05:30), as a UTC instant. */
export function startOfIstDay(now = new Date()): Date {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
}

export async function stats(db: DB, now = new Date()) {
  const n = async (q: Promise<Array<{ n: number }>>) => (await q)[0].n;
  const [photos, verified, flagged, spotsN, witnessToday, projectsN, pairs] = await Promise.all([
    n(db.select({ n: count() }).from(assets)),
    n(db.select({ n: count() }).from(assets).where(eq(assets.trustBand, "VERIFIED"))),
    n(db.select({ n: count() }).from(assets).where(eq(assets.trustBand, "FLAGGED"))),
    n(db.select({ n: count() }).from(spots)),
    n(db.select({ n: count() }).from(assets).where(and(eq(assets.source, "witness"), gte(assets.createdAt, startOfIstDay(now))))),
    n(db.select({ n: count() }).from(projects)),
    n(db.select({ n: count() }).from(comparisons).where(isNotNull(comparisons.maskBeforeUrl))),
  ]);
  return { photos, verified, flagged, spots: spotsN, witnessToday, projects: projectsN, pairs, at: now.toISOString() };
}

// --- /api/assets/[id]/layers ----------------------------------------------------------------------

/** Everything the 3D evidence viewer stacks: photo, capture facts, pHash bits, tags, mask, trust, proof strip. */
export async function assetLayers(db: DB, media: MediaProvider, id: string, appUrl: string) {
  const [a] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!a) return null;
  const ms = await db.select().from(measurements).where(eq(measurements.assetId, a.id));
  const mask = ms.find((m) => m.maskUrl);
  await ensureQr(media, a.id, appUrl);
  const date = shortDate(a.capturedAt ?? a.uploadedAt);
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
    mask: mask ? { url: mask.maskUrl, metric: mask.metric, value: mask.value } : null,
    trust: { score: a.trustScore, band: a.trustBand, reasons: (a.trustReasons ?? []).map((r) => ({ ...r, sentence: describeReason(r) })) },
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

// --- /api/demo/try (P1) -----------------------------------------------------------------------------

export const SANDBOX_SLUG = "try-to-fool-it";
export const sandboxProjectId = () => uuidv5(`project:${SANDBOX_SLUG}`, DEMO_NAMESPACE);
export const SANDBOX_TTL_MS = 24 * 3_600_000;

export async function ensureSandbox(db: DB): Promise<string> {
  const id = sandboxProjectId();
  const values = {
    name: "Try to fool it",
    slug: SANDBOX_SLUG,
    type: "other" as const,
    description: "Sandbox: upload any image and see what the Trust Engine makes of it. Photos are deleted after 24 hours. No site or dates, so location and time score nothing here.",
    source: "user" as const,
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
    const store = (media as { store?: { remove(id: string): Promise<void> } }).store;
    await store?.remove(a.publicId).catch(() => undefined);
  }
  if (old.length) await appendAudit(db, { assetId: null, actor: "sandbox", action: "sandbox.swept", detail: { deleted: old.length } });
  return old.length;
}

/** Uploads an image into the sandbox, runs the whole pipeline now, returns its trust ledger. */
export async function tryToFoolIt(deps: PipelineDeps, file: Buffer, filename: string, appUrl: string) {
  await sweepSandbox(deps.db, deps.media);
  const projectId = await ensureSandbox(deps.db);
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
    reasons: (a.trustReasons ?? []).map((r) => ({ code: r.code, kind: r.kind, points: r.points, sentence: describeReason(r) })),
    evidenceUrl: `${appUrl}/e/${a.id}`,
    note: "The sandbox has no site or dates, so location and time can't earn points here, and even a genuine photo can't reach VERIFIED. Watch the flags: reuse, stock, screen, stamp.",
    expiresAt: new Date(a.createdAt.getTime() + SANDBOX_TTL_MS).toISOString(),
  };
}
