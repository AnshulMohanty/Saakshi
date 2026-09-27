CREATE TYPE "public"."assignment_method" AS ENUM('capture_hint', 'geo_time', 'similarity', 'manual', 'none');--> statement-breakpoint
CREATE TYPE "public"."exif_source" AS ENUM('file', 'commons_api', 'none');--> statement-breakpoint
CREATE TYPE "public"."project_source" AS ENUM('demo_archive', 'user');--> statement-breakpoint
CREATE TYPE "public"."spot_origin" AS ENUM('auto_cluster', 'manual');--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "exif_source" "exif_source" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "captured_at_tz_assumed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "capture" jsonb;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "pipeline" jsonb DEFAULT '{"steps":{}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "assignment_method" "assignment_method" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "test_case" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source" "project_source" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "spots" ADD COLUMN "created_from" "spot_origin" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE INDEX "assets_source_idx" ON "assets" USING btree ("source");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_external_id_unique" UNIQUE("external_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_slug_unique" UNIQUE("slug");