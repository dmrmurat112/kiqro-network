ALTER TABLE "advertiser_users" ADD COLUMN "terms_accepted_version" text;--> statement-breakpoint
ALTER TABLE "advertiser_users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "advertiser_users" ADD COLUMN "terms_accepted_ip" text;