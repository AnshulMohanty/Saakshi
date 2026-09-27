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

export interface TrustReason {
  code: string;
  /** Signed contribution to the score. */
  weight: number;
  message: string;
}

export interface ModerationResult {
  status: "pending" | "approved" | "rejected";
  answers?: Record<string, boolean>;
  checkedAt?: string;
}

export interface ReportClaim {
  id: string;
  label: string;
  value: number;
  unit: string;
  method: ClaimMethod;
  asset_ids: string[];
  confidence?: number;
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
  startDate: date("start_date"),
  endDate: date("end_date"),
  sdgs: integer("sdgs").array().notNull().default(sql`'{}'::integer[]`),
  minPairGapDays: integer("min_pair_gap_days").notNull().default(14),
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
    attribution: jsonb("attribution").$type<Attribution>(),

    trustScore: integer("trust_score"),
    trustBand: text("trust_band"),
    trustReasons: jsonb("trust_reasons").$type<TrustReason[]>(),
    status: assetStatus("status").notNull().default("processing"),
    transforms: jsonb("transforms").$type<TransformEdit[]>().notNull().default([]),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("assets_cld_public_id_key").on(t.cldPublicId),
    index("assets_project_idx").on(t.projectId),
    index("assets_spot_idx").on(t.spotId),
    index("assets_status_idx").on(t.status),
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
    sameProject: boolean("same_project").notNull(),
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
    gapDays: doublePrecision("gap_days"),
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
    ...timestamps(),
  },
  (t) => [
    index("comparisons_project_idx").on(t.projectId),
    uniqueIndex("comparisons_pair_metric_key").on(t.beforeAssetId, t.afterAssetId, t.metric),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: reportKind("kind").notNull(),
    claims: jsonb("claims").$type<ReportClaim[]>().notNull().default([]),
    pdfPublicId: text("pdf_public_id"),
    ...timestamps(),
  },
  (t) => [index("reports_project_idx").on(t.projectId)],
);

/** Append-only, hash-chained (see lib/hashchain.ts and lib/audit.ts). Never update or delete rows. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey(),
    /** Append order; the chain is verified in this order. */
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
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
  ],
);

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
export type Spot = typeof spots.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type AuditRow = typeof auditLog.$inferSelect;
