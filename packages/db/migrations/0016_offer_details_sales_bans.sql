CREATE TABLE "currency_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"placement_id" text NOT NULL,
	"multiplier_bps" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currency_sales_multiplier" CHECK ("currency_sales"."multiplier_bps" > 10000 AND "currency_sales"."multiplier_bps" <= 50000)
);
--> statement-breakpoint
CREATE TABLE "publisher_user_bans" (
	"id" text PRIMARY KEY NOT NULL,
	"publisher_org_id" text NOT NULL,
	"publisher_user_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "instructions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "category" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "screenshots" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "currency_sales" ADD CONSTRAINT "currency_sales_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_user_bans" ADD CONSTRAINT "publisher_user_bans_publisher_org_id_organizations_id_fk" FOREIGN KEY ("publisher_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "currency_sales_placement_idx" ON "currency_sales" USING btree ("placement_id","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "publisher_user_bans_uq" ON "publisher_user_bans" USING btree ("publisher_org_id","publisher_user_id");