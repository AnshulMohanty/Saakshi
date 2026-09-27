/**
 * Evidence pipeline steps. Each takes the current asset and returns an output (stored in
 * assets.pipeline.steps[name].output, JSON), a column patch and optional side-table writes
 * (apply). The runner applies them, records the step and appends the audit row in one
 * transaction. External calls (Cloudinary write-back) and re-scoring other assets happen in the
 * step body and are idempotent.
 */
import { eq, isNull } from "drizzle-orm";
import { MODERATION_QUESTIONS } from "../ai/questions";
import { TAXONOMY } from "../ai/taxonomy";
import type { DB } from "../db/client";
import { assets, projects, spots, type Asset, type NewAsset, type PipelineStepName } from "../db/schema";
import type { AIProvider } from "../providers/ai";
import type { AnalysisProvider } from "../providers/analysis";
import type { GeocoderProvider } from "../providers/geocoder";
import type { MediaProvider } from "../providers/media";
import { assign, type AssignmentMethod } from "./assign";
import { computeTrust, rescoreMatches, statusFor, trustAuditDetail, trustPatch, writeBack, writeDuplicates } from "./score";
import { parseAssetMetadata, type MetadataInput } from "./metadata";

export interface PipelineDeps {
  db: DB;
  media: MediaProvider;
  analysis: AnalysisProvider;
  ai: AIProvider;
  geocoder: GeocoderProvider;
  exifDefaultOffset: string;
  similarityThreshold: number;
}

export interface StepResult {
  output: Record<string, unknown>;
  patch: Partial<NewAsset>;
  /** Writes to other tables, run inside the step transaction (must be idempotent). */
  apply?: (tx: DB) => Promise<void>;
}

export type Step = (deps: PipelineDeps, asset: Asset) => Promise<StepResult>;

/** Order matters: later steps read earlier steps' columns. */
export const STEP_ORDER: PipelineStepName[] = ["parseMetadata", "analyze", "understand", "embed", "assign", "score", "finalize"];

/** Signed, w_1024 derivative sent to the vision model (never the original). */
export const UNDERSTAND_TRANSFORM = [{ width: 1024, crop: "limit" as const }, { format: "jpg" as const, quality: "auto" as const }];

const ingestOf = (a: Asset) => (a.pipeline?.ingest ?? {}) as NonNullable<MetadataInput["ingest"]> & {
  hint?: { projectId?: string | null; spotId?: string | null };
};

const parseMetadata: Step = async (deps, asset) => {
  const meta = parseAssetMetadata({ source: asset.source, ingest: ingestOf(asset), capture: asset.capture, defaultOffset: deps.exifDefaultOffset });
  const placeName = meta.location ? await deps.geocoder.reverse(meta.location.lat, meta.location.lng) : null;
  return {
    output: { exifSource: meta.exifSource, capturedAt: meta.capturedAt, tzAssumed: meta.capturedAtTzAssumed, location: meta.location, placeName },
    patch: {
      exifSource: meta.exifSource,
      capturedAt: meta.capturedAt ? new Date(meta.capturedAt) : null,
      capturedAtTzAssumed: meta.capturedAtTzAssumed,
      exifLat: meta.exifLat,
      exifLng: meta.exifLng,
      cameraMake: meta.cameraMake,
      cameraModel: meta.cameraModel,
      placeName,
    },
  };
};

const analyze: Step = async (deps, asset) => {
  const [tags, answers, watermark] = await Promise.all([
    deps.analysis.tag(asset.cldPublicId, TAXONOMY),
    deps.analysis.moderate(asset.cldPublicId, MODERATION_QUESTIONS),
    deps.analysis.detectWatermark(asset.cldPublicId),
  ]);
  return {
    output: { tags, answers, watermark },
    patch: { cldTags: tags, moderation: { status: "pending", answers, checkedAt: new Date().toISOString() }, watermark },
  };
};

const understand: Step = async (deps, asset) => {
  const url = deps.media.url(asset.cldPublicId, UNDERSTAND_TRANSFORM, { signed: true });
  const analysis = await deps.ai.describePhoto(url);
  return {
    output: { activity: analysis.activity, stage: analysis.stage, confidence: analysis.confidence, textInImage: analysis.textInImage, model: analysis.model },
    patch: { ai: analysis, caption: analysis.caption },
  };
};

/** The text an asset is embedded from: caption + tags + activity + place. */
export function embeddingText(a: Pick<Asset, "caption" | "cldTags" | "ai" | "placeName">): string {
  return [a.caption, a.cldTags.join(" ").replaceAll("_", " "), a.ai?.activity, a.placeName].filter(Boolean).join(". ");
}

const embed: Step = async (deps, asset) => {
  const text = embeddingText(asset);
  return { output: { text, dims: 1536 }, patch: { embedding: await deps.ai.embed(text) } };
};

/** Embeds each project's description once (projects.embedding). */
export async function ensureProjectEmbeddings(deps: PipelineDeps): Promise<number> {
  const missing = await deps.db.select().from(projects).where(isNull(projects.embedding));
  for (const p of missing) {
    const embedding = await deps.ai.embed([p.name, p.description].filter(Boolean).join(". "));
    await deps.db.update(projects).set({ embedding }).where(eq(projects.id, p.id));
  }
  return missing.length;
}

const assignStep: Step = async (deps, asset) => {
  await ensureProjectEmbeddings(deps);
  const [ps, ss] = await Promise.all([deps.db.select().from(projects), deps.db.select().from(spots)]);
  const location =
    asset.source === "witness" && asset.capture?.deviceFix
      ? { lat: asset.capture.deviceFix.lat, lng: asset.capture.deviceFix.lng }
      : asset.exifLat !== null && asset.exifLng !== null
        ? { lat: asset.exifLat, lng: asset.exifLng }
        : null;
  const result = assign(
    {
      hint: ingestOf(asset).hint ?? null,
      location,
      capturedAt: asset.capturedAt?.toISOString() ?? null,
      embedding: asset.embedding,
      current: { projectId: asset.projectId, spotId: asset.spotId, method: asset.assignmentMethod as AssignmentMethod },
    },
    ps.map((p) => ({
      id: p.id,
      center: p.centerLat !== null && p.centerLng !== null ? { lat: p.centerLat, lng: p.centerLng } : null,
      radiusM: p.radiusM,
      startDate: p.startDate,
      endDate: p.endDate,
      embedding: p.embedding,
    })),
    ss.map((s) => ({ id: s.id, projectId: s.projectId, center: { lat: s.lat, lng: s.lng }, radiusM: s.radiusM })),
    { threshold: deps.similarityThreshold },
  );
  return {
    output: { ...result },
    patch: { projectId: result.projectId, spotId: result.spotId, assignmentMethod: result.method },
  };
};

/**
 * Trust Engine (lib/trust): score, band and reasons; duplicates written both ways (in the step
 * transaction); Cloudinary write-back of trust_score, trust_band and one band tag. Then the
 * matched photos are re-scored: a new photo can make an older one the original of a reuse.
 */
export async function scoreAndWriteBack(deps: PipelineDeps, asset: Asset): Promise<StepResult> {
  const { result, matches } = await computeTrust(deps.db, asset);
  const metadata = await writeBack(deps.media, asset, result);
  const rescored = await rescoreMatches(deps.db, deps.media, asset.id, matches.map((m) => m.assetId), `new near-duplicate ${asset.id}`);
  return {
    output: {
      ...trustAuditDetail(result),
      matches: matches.map((m) => ({ assetId: m.assetId, hamming: m.hamming, exact: m.exact, sameProject: m.sameProject })),
      rescored: rescored.filter((r) => r.changed).map((r) => ({ assetId: r.assetId, band: r.after.band })),
      metadata,
    },
    patch: trustPatch(result, asset.status),
    apply: (tx) => writeDuplicates(tx, asset.id, matches),
  };
}

const finalize: Step = async (_deps, asset) => {
  const status = statusFor(asset.trustBand, asset.status);
  return { output: { status, band: asset.trustBand, score: asset.trustScore }, patch: { status } };
};

export const STEPS: Record<PipelineStepName, Step> = {
  parseMetadata,
  analyze,
  understand,
  embed,
  assign: assignStep,
  score: scoreAndWriteBack,
  finalize,
};

/** Loads an asset or throws. */
export async function loadAsset(db: DB, assetId: string): Promise<Asset> {
  const [a] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!a) throw new Error(`Asset ${assetId} not found`);
  return a;
}
