CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'in_review', 'active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."conversion_status" AS ENUM('approved', 'held', 'rejected', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_kind" AS ENUM('advertiser_balance', 'publisher_payable', 'kiqro_revenue', 'external_cash');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('advertiser', 'publisher', 'internal');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."placement_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('android', 'ios', 'web');--> statement-breakpoint
CREATE TABLE "campaign_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"seq" integer NOT NULL,
	"mmp_event_name" text NOT NULL,
	"time_limit_days" integer NOT NULL,
	"display_name" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"tracking_url" text NOT NULL,
	"countries" text[] NOT NULL,
	"total_budget" bigint NOT NULL,
	"daily_budget" bigint,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"attribution_window_days" integer DEFAULT 7 NOT NULL,
	"ctit_min_seconds" integer DEFAULT 10 NOT NULL,
	"title" jsonb NOT NULL,
	"description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"placement_id" text NOT NULL,
	"publisher_user_id" text NOT NULL,
	"country" text,
	"ip" text,
	"user_agent" text,
	"sub_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversions" (
	"id" text PRIMARY KEY NOT NULL,
	"click_id" text NOT NULL,
	"task_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"placement_id" text NOT NULL,
	"publisher_user_id" text NOT NULL,
	"status" "conversion_status" NOT NULL,
	"reasons" text[] DEFAULT '{}' NOT NULL,
	"advertiser_price" bigint NOT NULL,
	"publisher_payout" bigint NOT NULL,
	"user_reward_points" bigint NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"postback_raw_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "ledger_account_kind" NOT NULL,
	"org_id" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	CONSTRAINT "ledger_accounts_uq" UNIQUE NULLS NOT DISTINCT("kind","org_id","currency")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"account_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "org_type" NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"status" "org_status" DEFAULT 'pending' NOT NULL,
	"billing_entity" text DEFAULT 'kiqro_inc' NOT NULL,
	"invoice_currency" text DEFAULT 'USD' NOT NULL,
	"postback_key" text,
	"postback_secret" text,
	"reversal_window_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_postback_key_unique" UNIQUE("postback_key")
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" text PRIMARY KEY NOT NULL,
	"publisher_org_id" text NOT NULL,
	"name" text NOT NULL,
	"app_key" text NOT NULL,
	"secret" text NOT NULL,
	"status" "placement_status" DEFAULT 'active' NOT NULL,
	"currency_name" text NOT NULL,
	"points_per_usd" numeric(18, 6) NOT NULL,
	"revshare_bps" integer NOT NULL,
	"postback_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placements_app_key_unique" UNIQUE("app_key")
);
--> statement-breakpoint
CREATE TABLE "postbacks_raw" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"ip" text,
	"outcome" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"icon_url" text,
	"mmp" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publisher_postbacks" (
	"id" text PRIMARY KEY NOT NULL,
	"conversion_id" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"country" text NOT NULL,
	"price" bigint NOT NULL,
	CONSTRAINT "task_payouts_price_positive" CHECK ("task_payouts"."price" > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_tasks" ADD CONSTRAINT "campaign_tasks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_click_id_clicks_id_fk" FOREIGN KEY ("click_id") REFERENCES "public"."clicks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_task_id_campaign_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."campaign_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_postback_raw_id_postbacks_raw_id_fk" FOREIGN KEY ("postback_raw_id") REFERENCES "public"."postbacks_raw"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_publisher_org_id_organizations_id_fk" FOREIGN KEY ("publisher_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_postbacks" ADD CONSTRAINT "publisher_postbacks_conversion_id_conversions_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_payouts" ADD CONSTRAINT "task_payouts_task_id_campaign_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."campaign_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_tasks_event_uq" ON "campaign_tasks" USING btree ("campaign_id","mmp_event_name");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_tasks_seq_uq" ON "campaign_tasks" USING btree ("campaign_id","seq");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clicks_user_idx" ON "clicks" USING btree ("placement_id","publisher_user_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversions_click_task_uq" ON "conversions" USING btree ("click_id","task_id");--> statement-breakpoint
CREATE INDEX "conversions_user_task_idx" ON "conversions" USING btree ("placement_id","publisher_user_id","task_id");--> statement-breakpoint
CREATE INDEX "conversions_campaign_idx" ON "conversions" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "publisher_postbacks_due_idx" ON "publisher_postbacks" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "publisher_postbacks_uq" ON "publisher_postbacks" USING btree ("conversion_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "task_payouts_uq" ON "task_payouts" USING btree ("task_id","country");