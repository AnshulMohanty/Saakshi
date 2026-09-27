CREATE TYPE "public"."asset_source" AS ENUM('witness', 'upload', 'archive', 'planted_test');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('processing', 'ready', 'flagged', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."measure_method" AS ENUM('measured', 'ai_estimated');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('cleanup', 'plantation', 'school', 'water', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('impact', 'campaign');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"spot_id" uuid,
	"source" "asset_source" NOT NULL,
	"cld_public_id" text NOT NULL,
	"cld_asset_id" text,
	"etag" text,
	"phash" text,
	"width" integer,
	"height" integer,
	"captured_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exif_lat" double precision,
	"exif_lng" double precision,
	"device_lat" double precision,
	"device_lng" double precision,
	"device_accuracy_m" double precision,
	"capture_token_id" uuid,
	"place_name" text,
	"camera_make" text,
	"camera_model" text,
	"quality_score" real,
	"faces_count" integer,
	"ai" jsonb,
	"cld_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"moderation" jsonb,
	"watermark" boolean,
	"caption" text,
	"embedding" vector(1536),
	"attribution" jsonb,
	"trust_score" integer,
	"trust_band" text,
	"trust_reasons" jsonb,
	"status" "asset_status" DEFAULT 'processing' NOT NULL,
	"transforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"asset_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp (3) with time zone NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"project_id" uuid,
	"spot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"spot_id" uuid,
	"before_asset_id" uuid NOT NULL,
	"after_asset_id" uuid NOT NULL,
	"distance_m" double precision,
	"gap_days" double precision,
	"metric" text NOT NULL,
	"before_value" double precision,
	"after_value" double precision,
	"delta" double precision,
	"method" "measure_method" NOT NULL,
	"confidence" real,
	"mask_before_url" text,
	"mask_after_url" text,
	"composite_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duplicates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"match_asset_id" uuid NOT NULL,
	"hamming" integer NOT NULL,
	"same_project" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geocache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"place_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "project_type" DEFAULT 'other' NOT NULL,
	"description" text,
	"center_lat" double precision,
	"center_lng" double precision,
	"radius_m" double precision,
	"start_date" date,
	"end_date" date,
	"sdgs" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"min_pair_gap_days" integer DEFAULT 14 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "report_kind" NOT NULL,
	"claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf_public_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_m" double precision DEFAULT 30 NOT NULL,
	"baseline_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_capture_token_id_capture_tokens_id_fk" FOREIGN KEY ("capture_token_id") REFERENCES "public"."capture_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_tokens" ADD CONSTRAINT "capture_tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_tokens" ADD CONSTRAINT "capture_tokens_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_before_asset_id_assets_id_fk" FOREIGN KEY ("before_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_after_asset_id_assets_id_fk" FOREIGN KEY ("after_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicates" ADD CONSTRAINT "duplicates_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicates" ADD CONSTRAINT "duplicates_match_asset_id_assets_id_fk" FOREIGN KEY ("match_asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_baseline_asset_id_assets_id_fk" FOREIGN KEY ("baseline_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_cld_public_id_key" ON "assets" USING btree ("cld_public_id");--> statement-breakpoint
CREATE INDEX "assets_project_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "assets_spot_idx" ON "assets" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "assets_status_idx" ON "assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "assets_captured_at_idx" ON "assets" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "assets_trust_band_idx" ON "assets" USING btree ("trust_band");--> statement-breakpoint
CREATE INDEX "assets_phash_idx" ON "assets" USING btree ("phash");--> statement-breakpoint
CREATE INDEX "assets_embedding_hnsw_idx" ON "assets" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "audit_log_seq_key" ON "audit_log" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_log_hash_key" ON "audit_log" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "audit_log_asset_idx" ON "audit_log" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "capture_tokens_expires_idx" ON "capture_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "comparisons_project_idx" ON "comparisons" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comparisons_pair_metric_key" ON "comparisons" USING btree ("before_asset_id","after_asset_id","metric");--> statement-breakpoint
CREATE UNIQUE INDEX "duplicates_pair_key" ON "duplicates" USING btree ("asset_id","match_asset_id");--> statement-breakpoint
CREATE INDEX "duplicates_match_idx" ON "duplicates" USING btree ("match_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geocache_key_key" ON "geocache" USING btree ("key");--> statement-breakpoint
CREATE INDEX "reports_project_idx" ON "reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "spots_project_idx" ON "spots" USING btree ("project_id");