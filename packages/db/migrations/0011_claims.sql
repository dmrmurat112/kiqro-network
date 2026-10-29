CREATE TYPE "public"."claim_status" AS ENUM('open', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"placement_id" text NOT NULL,
	"publisher_user_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"task_id" text NOT NULL,
	"click_id" text NOT NULL,
	"status" "claim_status" DEFAULT 'open' NOT NULL,
	"user_note" text,
	"decision_note" text,
	"decided_by_advertiser_user_id" text,
	"decided_by_admin_user_id" text,
	"decided_at" timestamp with time zone,
	"conversion_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_task_id_campaign_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."campaign_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_click_id_clicks_id_fk" FOREIGN KEY ("click_id") REFERENCES "public"."clicks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_decided_by_advertiser_user_id_advertiser_users_id_fk" FOREIGN KEY ("decided_by_advertiser_user_id") REFERENCES "public"."advertiser_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_decided_by_admin_user_id_admin_users_id_fk" FOREIGN KEY ("decided_by_admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_conversion_id_conversions_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claims_campaign_idx" ON "claims" USING btree ("campaign_id","status","created_at");--> statement-breakpoint
CREATE INDEX "claims_user_idx" ON "claims" USING btree ("placement_id","publisher_user_id");