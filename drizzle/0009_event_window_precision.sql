ALTER TABLE "assets" ADD COLUMN "captured_at_precision" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "monitoring_ends_at" date;--> statement-breakpoint
UPDATE "assets" SET "captured_at_precision" = "pipeline"->'ingest'->'commons'->'date'->>'precision' WHERE "captured_at" IS NOT NULL AND "exif_source" = 'commons_api' AND "pipeline"->'ingest'->'commons'->'date'->>'precision' IS NOT NULL;--> statement-breakpoint
UPDATE "assets" SET "captured_at_precision" = 'second' WHERE "captured_at" IS NOT NULL AND "captured_at_precision" IS NULL;
