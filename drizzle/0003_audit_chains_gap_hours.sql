CREATE TABLE "data_migrations" (
	"id" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_asset_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "comparisons" ADD COLUMN "gap_hours" double precision;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "min_pair_gap_hours" double precision DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_chain_idx" ON "audit_log" USING btree ("asset_id","seq");--> statement-breakpoint
-- Pair gaps depend on the activity: a clean-up finishes within hours; saplings need weeks.
UPDATE "projects" SET "min_pair_gap_hours" = CASE "type"
  WHEN 'cleanup' THEN 0.5 WHEN 'water' THEN 0.5 WHEN 'plantation' THEN 336 WHEN 'school' THEN 168 ELSE 24 END;--> statement-breakpoint
UPDATE "comparisons" SET "gap_hours" = "gap_days" * 24 WHERE "gap_days" IS NOT NULL;
