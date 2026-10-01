/**
 * Drizzle schema. The same schema and migrations run on PGlite (local) and Postgres (Supabase).
 * Imports here are type-only so drizzle-kit can load this file without path aliases.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
  bigint,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { ClaimMethod } from "../claims";
import type { TransformStep } from "../media/transform";
import type { PhotoAnalysis } from "../providers/ai/schemas";
import type { TrustBand, TrustReason } from "../trust/types";

export type { TrustReason };

export const EMBEDDING_DIMENSIONS = 1536;

const id = () => uuid("id").primaryKey().defaultRandom();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------------------------
// Enums

export const projectType = pgEnum("project_type", ["cleanup", "plantation", "school", "water", "other"]);
export const assetSource = pgEnum("asset_source", ["witness", "upload", "archive", "planted_test"]);
export const assetStatus = pgEnum("asset_status", ["processing", "ready", "flagged", "approved", "rejected"]);
export const measureMethod = pgEnum("measure_method", ["measured", "ai_estimated"]);
export const reportKind = pgEnum("report_kind", ["impact", "campaign"]);
/** Where an asset's EXIF-like metadata came from. Commons thumbnails carry none of their own. */
export const exifSource = pgEnum("exif_source", ["file", "commons_api", "none"]);
export const assignmentMethod = pgEnum("assignment_method", ["capture_hint", "geo_time", "similarity", "manual", "none"]);
export const projectSource = pgEnum("project_source", ["demo_archive", "user"]);
export const spotOrigin = pgEnum("spot_origin", ["auto_cluster", "manual"]);

/** What a comparison or measurement measures. Percentages are 0–100; items is a count. */
export type MetricId = "litter_cover" | "items_visible" | "green_cover" | "exg_green_cover";
export type ComparisonOrigin = "auto" | "manual" | "checkin";

export interface ComparisonDetail {
  caveat: string;
  unit: "%" | "items";
  /** Pairing facts at the time the pair was chosen. */
  stageScore?: number;
  hamming?: number | null;
  /** Plantation: |mask − ExG| in points, and whether that made the reading low-confidence. */
  agreement?: { before: number | null; after: number | null; lowConfidence: boolean };
  /** Signed, face-blurred, same-frame URLs of each side (for the slider). */
  frameBeforeUrl?: string;
  frameAfterUrl?: string;
  /** Who chose a manual pair, and why. */
  chosenBy?: string;
  note?: string;
  /** CLD_COMPOSITE_MODE=server: the composite is its own asset; compositeTransforms apply to it. */
  compositePublicId?: string;
}

export type ProviderMode = "mock" | "real";

/** Which provider (mock or real) and which model produced each derived value on an asset. */
export interface AssetProvenance {
  analysis?: { mode: ProviderMode; provider: string };
  ai?: { mode: ProviderMode; model: string };
  embedding?: { mode: ProviderMode; model: string };
}

export type CapturePrecision = "second" | "minute" | "hour" | "day" | "month" | "year";

/** Deliberately planted test inputs (source = planted_test). */
export type TestCase = "reused" | "stock" | "location_mismatch" | "stamp_mismatch";

// ---------------------------------------------------------------------------------------------
// JSON column shapes

export interface Attribution {
  author: string | null;
  license: string | null;
  license_url: string | null;
  source_url: string | null;
  title: string | null;
}

/** One entry of an image's edit history: the Transform applied, by whom, when. */
export interface TransformEdit {
  at: string;
  actor: string;
  steps: TransformStep[];
  note?: string;
}

/** A reviewer's decision. It never changes the score or band; it sets status and moderation. */
export interface ReviewDecision {
  decision: "approve" | "reject";
  note: string;
  actor: string;
  at: string;
  /** Band and score at the time of review, for the record. */
  band: TrustBand | null;
  score: number | null;
}

export interface ModerationResult {
  status: "pending" | "approved" | "rejected";
  answers?: Record<string, boolean>;
  checkedAt?: string;
}

export interface DeviceFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  /** When the browser obtained the fix (ISO). */
  fixTimestamp?: string | null;
}

/** Witness Capture provenance, checked against the capture token on upload confirm. */
export interface CaptureInfo {
  tokenId: string | null;
  /** Device clock at the shutter. */
  clientCapturedAt: string | null;
  /** Server clock when the upload ticket was issued (requested at the shutter): the time anchor. */
  ticketIssuedAt: string | null;
  /** Server clock when the upload was confirmed (slow uploads are fine, within 30 min). */
  serverReceivedAt: string;
  deviceFix: DeviceFix | null;
  /** Browser location of someone uploading from their gallery: informational only. */
  uploaderLocation: DeviceFix | null;
  attested: boolean;
  reasons: Array<{ code: string; message: string }>;
}

export type PipelineStepName = "parseMetadata" | "analyze" | "understand" | "embed" | "assign" | "score" | "measure" | "finalize";

export interface PipelineStepRecord {
  status: "running" | "done" | "error";
  attempts: number;
  startedAt: string;
  finishedAt?: string;
  output?: unknown;
  error?: string;
}

export interface PipelineState {
  /** Raw inputs captured at ingest (provider media metadata, Commons metadata, …). */
  ingest?: Record<string, unknown>;
  steps: Partial<Record<PipelineStepName, PipelineStepRecord>>;
  completedAt?: string;
}

export interface ReportClaim {
  id: string;
  label: string;
  value: number;
  unit: string;
  method: ClaimMethod;
  asset_ids: string[];
  confidence?: number;
  provider_mode?: ProviderMode;
  /** Supporting facts shown next to the number (never used in prose). */
  detail?: { topReasons?: Array<{ code: string; n: number }>; testInputs?: string[]; pairs?: number; basis?: string };
}

export interface CampaignKit {
  caption: string;
  /** Alt text per template, each stat with its method label. */
  alts: Record<"stat" | "split" | "proof", string>;
  /** Which claim the stat card shows, and which pair and photo the other two use. */
  statClaimId: string | null;
  pair: { beforeAssetId: string; afterAssetId: string } | null;
  photoAssetId: string | null;
}

// ---------------------------------------------------------------------------------------------
// Tables

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  type: projectType("type").notNull().default("other"),
  description: text("description"),
  centerLat: doublePrecision("center_lat"),
  centerLng: doublePrecision("center_lng"),
  radiusM: doublePrecision("radius_m"),
  /** The event window: the activity itself (for demo projects, the densest run of capture dates ± 7 days). */
  startDate: date("start_date"),
  endDate: date("end_date"),
  /** Monitoring period: from the day after endDate until this date (null = open-ended). */
  monitoringEndsAt: date("monitoring_ends_at"),
  sdgs: integer("sdgs").array().notNull().default(sql`'{}'::integer[]`),
  /** Minimum hours between a before and an after photo: cleanup/water 0.5, plantation 336, school 168, other 24. */
  minPairGapHours: doublePrecision("min_pair_gap_hours").notNull().default(24),
  /** Embedding of the project description, for similarity-based assignment. */
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  source: projectSource("source").notNull().default("user"),
  /** Photo GPS is approximate (archive projects: Commons coordinates), so pairs may be up to 150 m apart. */
  locationApproximate: boolean("location_approximate").notNull().default(false),
  slug: text("slug").unique(),
  ...timestamps(),
});

export const spots = pgTable(
  "spots",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    radiusM: doublePrecision("radius_m").notNull().default(30),
    baselineAssetId: uuid("baseline_asset_id").references((): AnyPgColumn => assets.id, { onDelete: "set null" }),
    slug: text("slug").unique(),
    createdFrom: spotOrigin("created_from").notNull().default("manual"),
    /** Where to stand for a check-in ("from this pole, facing the sea"); null → "Stand where this photo was taken" with the baseline (B5.13). */
    framingNote: text("framing_note"),
    ...timestamps(),
  },
  (t) => [index("spots_project_idx").on(t.projectId)],
);

export const assets = pgTable(
  "assets",
  {
    id: id(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    spotId: uuid("spot_id").references((): AnyPgColumn => spots.id, { onDelete: "set null" }),
    source: assetSource("source").notNull(),

    cldPublicId: text("cld_public_id").notNull(),
    cldAssetId: text("cld_asset_id"),
    etag: text("etag"),
    phash: text("phash"),
    width: integer("width"),
    height: integer("height"),

    capturedAt: timestamp("captured_at", { withTimezone: true }),
    /** How precise captured_at is, from the source: a day-precision time is only a date. */
    capturedAtPrecision: text("captured_at_precision").$type<CapturePrecision>(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    exifLat: doublePrecision("exif_lat"),
    exifLng: doublePrecision("exif_lng"),
    deviceLat: doublePrecision("device_lat"),
    deviceLng: doublePrecision("device_lng"),
    deviceAccuracyM: doublePrecision("device_accuracy_m"),
    captureTokenId: uuid("capture_token_id").references(() => captureTokens.id, { onDelete: "set null" }),
    placeName: text("place_name"),
    cameraMake: text("camera_make"),
    cameraModel: text("camera_model"),

    qualityScore: real("quality_score"),
    facesCount: integer("faces_count"),
    ai: jsonb("ai").$type<PhotoAnalysis>(),
    cldTags: text("cld_tags").array().notNull().default(sql`'{}'::text[]`),
    moderation: jsonb("moderation").$type<ModerationResult>(),
    watermark: boolean("watermark"),
    caption: text("caption"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    /** Mock vs real provider (and model) behind analysis, AI and embedding; mock-derived numbers never ship. */
    provenance: jsonb("provenance").$type<AssetProvenance>().notNull().default({}),
    attribution: jsonb("attribution").$type<Attribution>(),

    trustScore: integer("trust_score"),
    trustBand: text("trust_band").$type<TrustBand>(),
    trustReasons: jsonb("trust_reasons").$type<TrustReason[]>(),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
    review: jsonb("review").$type<ReviewDecision>(),
    status: assetStatus("status").notNull().default("processing"),
    transforms: jsonb("transforms").$type<TransformEdit[]>().notNull().default([]),

    /** Stable id from the source archive, e.g. "commons:12345". Import idempotency key. */
    externalId: text("external_id").unique(),
    exifSource: exifSource("exif_source").notNull().default("none"),
    /** captured_at came from a timestamp without an offset; EXIF_DEFAULT_UTC_OFFSET was assumed. */
    capturedAtTzAssumed: boolean("captured_at_tz_assumed").notNull().default(false),
    capture: jsonb("capture").$type<CaptureInfo>(),
    pipeline: jsonb("pipeline").$type<PipelineState>().notNull().default({ steps: {} }),
    assignmentMethod: assignmentMethod("assignment_method").notNull().default("none"),
    testCase: text("test_case").$type<TestCase>(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("assets_cld_public_id_key").on(t.cldPublicId),
    index("assets_project_idx").on(t.projectId),
    index("assets_spot_idx").on(t.spotId),
    index("assets_status_idx").on(t.status),
    index("assets_source_idx").on(t.source),
    index("assets_captured_at_idx").on(t.capturedAt),
    index("assets_trust_band_idx").on(t.trustBand),
    index("assets_phash_idx").on(t.phash),
    index("assets_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const duplicates = pgTable(
  "duplicates",
  {
    id: id(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    matchAssetId: uuid("match_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    hamming: integer("hamming").notNull(),
    /** Identical file (same etag). */
    exact: boolean("exact").notNull().default(false),
    sameProject: boolean("same_project").notNull(),
    sameSpot: boolean("same_spot").notNull().default(false),
    gapHours: doublePrecision("gap_hours"),
    /** The matched photo came later (so this row's asset is the original). */
    matchIsLater: boolean("match_is_later").notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex("duplicates_pair_key").on(t.assetId, t.matchAssetId), index("duplicates_match_idx").on(t.matchAssetId)],
);

export const comparisons = pgTable(
  "comparisons",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    spotId: uuid("spot_id").references(() => spots.id, { onDelete: "set null" }),
    beforeAssetId: uuid("before_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    afterAssetId: uuid("after_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    distanceM: doublePrecision("distance_m"),
    gapHours: doublePrecision("gap_hours"),
    metric: text("metric").notNull(),
    beforeValue: doublePrecision("before_value"),
    afterValue: doublePrecision("after_value"),
    delta: doublePrecision("delta"),
    method: measureMethod("method").notNull(),
    /** Required when method is ai_estimated (0–1). */
    confidence: real("confidence"),
    maskBeforeUrl: text("mask_before_url"),
    maskAfterUrl: text("mask_after_url"),
    compositeUrl: text("composite_url"),
    /** The composite's Transform (the URL is signed and short-lived; this is the edit record). */
    compositeTransforms: jsonb("composite_transforms").$type<TransformStep[]>(),
    /** auto (pairing), manual (a person chose the pair) or checkin (baseline → Witness check-in). */
    origin: text("origin").$type<ComparisonOrigin>().notNull().default("auto"),
    /** "mock" if either photo's measurement came from a mock provider. */
    providerMode: text("provider_mode").$type<ProviderMode>().notNull().default("mock"),
    detail: jsonb("detail").$type<ComparisonDetail>(),
    ...timestamps(),
  },
  (t) => [
    index("comparisons_project_idx").on(t.projectId),
    uniqueIndex("comparisons_pair_metric_key").on(t.beforeAssetId, t.afterAssetId, t.metric),
  ],
);

/**
 * One measurement of one photo, cached forever: masks are deterministic for a given photo, frame
 * and prompt, so they are computed once (Cloudinary caches the derived mask too).
 */
export const measurements = pgTable(
  "measurements",
  {
    id: id(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    metric: text("metric").$type<MetricId>().notNull(),
    /** Compiled frame Transform the photo was measured on, e.g. "c_fill,g_auto,w_800,h_600". */
    frame: text("frame").notNull(),
    value: doublePrecision("value").notNull(),
    method: measureMethod("method").notNull(),
    confidence: real("confidence"),
    maskUrl: text("mask_url"),
    providerMode: text("provider_mode").$type<ProviderMode>().notNull().default("mock"),
    /** e.g. "cloudinary:e_extract" or "mock:colour-index". */
    provider: text("provider").notNull().default("mock:colour-index"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("measurements_asset_metric_frame_key").on(t.assetId, t.metric, t.frame), index("measurements_asset_idx").on(t.assetId)],
);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: reportKind("kind").notNull(),
    title: text("title"),
    /** The period the claims cover (defaults to the project's dates). */
    periodFrom: date("period_from"),
    periodTo: date("period_to"),
    claims: jsonb("claims").$type<ReportClaim[]>().notNull().default([]),
    /** Prose with {{claim:id}} placeholders (rendered on display, never stored with numbers). */
    prose: text("prose"),
    /** Statements without numbers, e.g. "Archive project: no recent check-ins". */
    notes: jsonb("notes").$type<string[]>().notNull().default([]),
    campaign: jsonb("campaign").$type<CampaignKit>(),
    /** "mock" if any claim rests on a mock-derived value. */
    providerMode: text("provider_mode").$type<ProviderMode>().notNull().default("mock"),
    pdfPublicId: text("pdf_public_id"),
    ...timestamps(),
  },
  (t) => [index("reports_project_idx").on(t.projectId)],
);

/**
 * Every call to a real external provider (Cloudinary, OpenAI): what it was, how much it used, how
 * long it took, what it cost where pricing is documented. Answers "cost per 1,000 photos" from logs.
 */
export const providerUsage = pgTable(
  "provider_usage",
  {
    id: id(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    provider: text("provider").notNull(),
    /** e.g. "upload", "analyze:ai_vision_tagging", "responses", "embeddings", "derived:e_extract". */
    operation: text("operation").notNull(),
    model: text("model"),
    mode: text("mode").$type<ProviderMode>().notNull(),
    /** Tokens, transformations, credits: whatever the provider reports. */
    units: jsonb("units").$type<Record<string, number>>().notNull().default({}),
    latencyMs: integer("latency_ms").notNull(),
    costUsd: doublePrecision("cost_usd"),
    ok: boolean("ok").notNull(),
    status: integer("status"),
    attempts: integer("attempts").notNull().default(1),
    /** Not a foreign key: usage outlives deleted assets. */
    assetId: uuid("asset_id"),
    error: text("error"),
  },
  (t) => [index("provider_usage_at_idx").on(t.at), index("provider_usage_provider_idx").on(t.provider, t.operation)],
);

/** Append-only, hash-chained (see lib/hashchain.ts and lib/audit.ts). Never update or delete rows. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey(),
    /** Append order; the chain is verified in this order. */
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    /** The chain this row belongs to: one per asset; null = the system chain. Deleting an asset deletes its chain. */
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true, precision: 3 }).notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [
    uniqueIndex("audit_log_seq_key").on(t.seq),
    uniqueIndex("audit_log_hash_key").on(t.hash),
    index("audit_log_asset_idx").on(t.assetId),
    index("audit_log_chain_idx").on(t.assetId, t.seq),
  ],
);

/**
 * Upload tickets, stored server-side: confirm and the webhook read the capture context and the
 * issue time from here, never from what the browser sends back.
 */
export const uploadTickets = pgTable("upload_tickets", {
  id: id(),
  publicId: text("public_id").notNull().unique(),
  provider: text("provider").notNull(),
  context: jsonb("context").$type<Record<string, string>>().notNull().default({}),
  issuedAt: timestamp("issued_at", { withTimezone: true, precision: 3 }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  ...timestamps(),
});

/** One-time data migrations run in TypeScript after the SQL migrations (see lib/db/data-migrations.ts). */
export const dataMigrations = pgTable("data_migrations", {
  id: text("id").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
});

export const captureTokens = pgTable(
  "capture_tokens",
  {
    id: id(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    spotId: uuid("spot_id").references(() => spots.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [index("capture_tokens_expires_idx").on(t.expiresAt)],
);

/** Reverse-geocoding cache. key = "lat,lng" rounded to 3 dp (lib/geo.ts coordKey). */
export const geocache = pgTable(
  "geocache",
  {
    id: id(),
    key: text("key").notNull(),
    placeName: text("place_name"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("geocache_key_key").on(t.key)],
);

export type Project = typeof projects.$inferSelect;
export type ProviderUsage = typeof providerUsage.$inferSelect;
export type Comparison = typeof comparisons.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type Spot = typeof spots.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type AuditRow = typeof auditLog.$inferSelect;
