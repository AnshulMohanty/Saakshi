ALTER TABLE "reports" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "period_from" date;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "period_to" date;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "prose" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "notes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "campaign" jsonb;