/**
 * Library queries: lean asset rows for the grid/map and full detail for the drawer.
 * Every image URL is signed and face-blurred (rule 5); originals are never exposed.
 */
import { and, asc, count, desc, eq, isNotNull, type SQL } from "drizzle-orm";
import type { DB } from "./db/client";
import { assets, auditLog, projects, spots, type Asset } from "./db/schema";
import type { Transform } from "./media/transform";
import { STEP_ORDER } from "./pipeline/steps";
import { MODERATION_QUESTIONS } from "./ai/questions";
import type { MediaProvider } from "./providers/media";

export const THUMB: Transform = [{ crop: "fill", gravity: "auto", width: 480, height: 360 }, { effect: "blur_faces" }, { format: "auto", quality: "auto" }];
export const PREVIEW: Transform = [{ width: 1280, crop: "limit" }, { effect: "blur_faces" }, { format: "auto", quality: "auto" }];

export const SOURCES = ["witness", "upload", "archive", "planted_test"] as const;
export const STATUSES = ["processing", "ready", "flagged", "approved", "rejected"] as const;

export interface LibraryFilters {
  project?: string | null;
  source?: (typeof SOURCES)[number] | null;
  status?: (typeof STATUSES)[number] | null;
  /** Only planted test inputs. */
  test?: boolean;
}

/** Best location: witness device fix, else EXIF/Commons GPS. */
function locationOf(a: Pick<Asset, "source" | "deviceLat" | "deviceLng" | "exifLat" | "exifLng">) {
  if (a.source === "witness" && a.deviceLat !== null && a.deviceLng !== null) return { lat: a.deviceLat, lng: a.deviceLng, from: "device" as const };
  if (a.exifLat !== null && a.exifLng !== null) return { lat: a.exifLat, lng: a.exifLng, from: "exif" as const };
  return null;
}

export async function listLibrary(db: DB, media: MediaProvider, f: LibraryFilters = {}) {
  const conds: SQL[] = [];
  if (f.project) conds.push(eq(assets.projectId, f.project));
  if (f.source) conds.push(eq(assets.source, f.source));
  if (f.status) conds.push(eq(assets.status, f.status));
  if (f.test) conds.push(isNotNull(assets.testCase));

  const rows = await db
    .select({
      id: assets.id, status: assets.status, source: assets.source, testCase: assets.testCase, projectId: assets.projectId,
      spotId: assets.spotId, cldPublicId: assets.cldPublicId, caption: assets.caption, placeName: assets.placeName,
      capturedAt: assets.capturedAt, uploadedAt: assets.uploadedAt, deviceLat: assets.deviceLat, deviceLng: assets.deviceLng,
      exifLat: assets.exifLat, exifLng: assets.exifLng, assignmentMethod: assets.assignmentMethod, capture: assets.capture,
      pipeline: assets.pipeline, trustBand: assets.trustBand,
    })
    .from(assets)
    .where(and(...conds))
    .orderBy(desc(assets.uploadedAt))
    .limit(500);

  const [ps, ss, [{ processing }]] = await Promise.all([
    db.select({ id: projects.id, name: projects.name, slug: projects.slug, type: projects.type, centerLat: projects.centerLat, centerLng: projects.centerLng, radiusM: projects.radiusM }).from(projects).orderBy(asc(projects.name)),
    db.select({ id: spots.id, projectId: spots.projectId, name: spots.name, slug: spots.slug, lat: spots.lat, lng: spots.lng, radiusM: spots.radiusM }).from(spots),
    db.select({ processing: count() }).from(assets).where(eq(assets.status, "processing")),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      source: r.source,
      testCase: r.testCase,
      projectId: r.projectId,
      spotId: r.spotId,
      caption: r.caption,
      placeName: r.placeName,
      capturedAt: r.capturedAt?.toISOString() ?? null,
      uploadedAt: r.uploadedAt.toISOString(),
      location: locationOf(r),
      assignmentMethod: r.assignmentMethod,
      attested: r.capture?.attested ?? null,
      failed: Object.values(r.pipeline.steps).some((s) => s?.status === "error"),
      trustBand: r.trustBand,
      thumbUrl: media.url(r.cldPublicId, THUMB, { signed: true }),
    })),
    projects: ps,
    spots: ss,
    processing,
  };
}

export type LibraryData = Awaited<ReturnType<typeof listLibrary>>;

export async function assetDetail(db: DB, media: MediaProvider, id: string) {
  const [a] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!a) return null;
  const [project] = a.projectId ? await db.select({ id: projects.id, name: projects.name, slug: projects.slug }).from(projects).where(eq(projects.id, a.projectId)) : [];
  const [spot] = a.spotId ? await db.select({ id: spots.id, name: spots.name, slug: spots.slug }).from(spots).where(eq(spots.id, a.spotId)) : [];
  const audit = await db
    .select({ seq: auditLog.seq, action: auditLog.action, actor: auditLog.actor, at: auditLog.at, hash: auditLog.hash, detail: auditLog.detail })
    .from(auditLog)
    .where(eq(auditLog.assetId, a.id))
    .orderBy(asc(auditLog.seq));
  const questions = Object.fromEntries(MODERATION_QUESTIONS.map((q) => [q.id, q.text]));

  return {
    id: a.id,
    status: a.status,
    source: a.source,
    testCase: a.testCase,
    previewUrl: media.url(a.cldPublicId, PREVIEW, { signed: true }),
    caption: a.caption,
    ai: a.ai,
    tags: a.cldTags,
    moderation: Object.entries(a.moderation?.answers ?? {}).map(([id, answer]) => ({ id, question: questions[id] ?? id, answer })),
    watermark: a.watermark,
    exif: {
      source: a.exifSource,
      capturedAt: a.capturedAt?.toISOString() ?? null,
      tzAssumed: a.capturedAtTzAssumed,
      lat: a.exifLat,
      lng: a.exifLng,
      make: a.cameraMake,
      model: a.cameraModel,
    },
    capture: a.capture,
    placeName: a.placeName,
    location: locationOf(a),
    project: project ?? null,
    spot: spot ?? null,
    assignment: { method: a.assignmentMethod, detail: (a.pipeline.steps.assign?.output as { detail?: Record<string, unknown> } | undefined)?.detail ?? null },
    attribution: a.attribution,
    dimensions: { width: a.width, height: a.height },
    phash: a.phash,
    uploadedAt: a.uploadedAt.toISOString(),
    steps: STEP_ORDER.map((name) => {
      const s = a.pipeline.steps[name];
      return { name, status: s?.status ?? "pending", startedAt: s?.startedAt ?? null, finishedAt: s?.finishedAt ?? null, attempts: s?.attempts ?? 0, error: s?.error ?? null };
    }),
    audit: audit.map((r) => ({ ...r, at: r.at.toISOString(), hash: r.hash.slice(0, 12) })),
  };
}

export type AssetDetail = NonNullable<Awaited<ReturnType<typeof assetDetail>>>;
