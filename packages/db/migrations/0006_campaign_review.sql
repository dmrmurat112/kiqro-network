ALTER TABLE "campaigns" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "reviewed_at" timestamp with time zone;