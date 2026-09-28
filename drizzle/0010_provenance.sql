ALTER TABLE "assets" ADD COLUMN "provenance" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "provider_mode" text DEFAULT 'mock' NOT NULL;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "provider_mode" text DEFAULT 'mock' NOT NULL;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "provider" text DEFAULT 'mock:colour-index' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "provider_mode" text DEFAULT 'mock' NOT NULL;--> statement-breakpoint
UPDATE "assets" SET "provenance" = jsonb_strip_nulls(jsonb_build_object('analysis', CASE WHEN "moderation" IS NOT NULL THEN jsonb_build_object('mode', 'mock', 'provider', 'mock-analysis-1') END, 'ai', CASE WHEN "ai" IS NOT NULL THEN jsonb_build_object('mode', 'mock', 'model', "ai"->>'model') END, 'embedding', CASE WHEN "embedding" IS NOT NULL THEN jsonb_build_object('mode', 'mock', 'model', 'mock-hash-embed-1') END));
