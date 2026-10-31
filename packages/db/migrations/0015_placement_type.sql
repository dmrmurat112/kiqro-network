CREATE TYPE "public"."placement_type" AS ENUM('android', 'ios', 'web', 'api');--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "type" "placement_type" DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "store_url" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "icon_url" text;