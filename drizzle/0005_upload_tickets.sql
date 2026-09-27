CREATE TABLE "upload_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"provider" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issued_at" timestamp (3) with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_tickets_public_id_unique" UNIQUE("public_id")
);
