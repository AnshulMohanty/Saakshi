CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"frame" text NOT NULL,
	"value" double precision NOT NULL,
	"method" "measure_method" NOT NULL,
	"confidence" real,
	"mask_url" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "composite_transforms" jsonb;--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "origin" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "detail" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "location_approximate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_asset_metric_frame_key" ON "measurements" USING btree ("asset_id","metric","frame");--> statement-breakpoint
CREATE INDEX "measurements_asset_idx" ON "measurements" USING btree ("asset_id");--> statement-breakpoint
UPDATE "projects" SET "location_approximate" = true WHERE "source" = 'demo_archive';
