ALTER TABLE "assets" ADD COLUMN "scored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "review" jsonb;--> statement-breakpoint
ALTER TABLE "duplicates" ADD COLUMN "exact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "duplicates" ADD COLUMN "same_spot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "duplicates" ADD COLUMN "gap_hours" double precision;--> statement-breakpoint
ALTER TABLE "duplicates" ADD COLUMN "match_is_later" boolean DEFAULT false NOT NULL;