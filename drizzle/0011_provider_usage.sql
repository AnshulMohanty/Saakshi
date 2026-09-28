CREATE TABLE "provider_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"model" text,
	"mode" text NOT NULL,
	"units" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latency_ms" integer NOT NULL,
	"cost_usd" double precision,
	"ok" boolean NOT NULL,
	"status" integer,
	"attempts" integer DEFAULT 1 NOT NULL,
	"asset_id" uuid,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "provider_usage_at_idx" ON "provider_usage" USING btree ("at");--> statement-breakpoint
CREATE INDEX "provider_usage_provider_idx" ON "provider_usage" USING btree ("provider","operation");