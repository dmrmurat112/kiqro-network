CREATE TYPE "public"."advertiser_role" AS ENUM('admin', 'member');--> statement-breakpoint
ALTER TABLE "advertiser_users" ADD COLUMN "role" "advertiser_role" DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "advertiser_users" ADD COLUMN "invited_by" text;--> statement-breakpoint
ALTER TABLE "advertiser_users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "advertiser_users" ADD COLUMN "totp_enabled_at" timestamp with time zone;