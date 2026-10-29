CREATE TABLE "revenue_events" (
	"id" text PRIMARY KEY NOT NULL,
	"click_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"event" text NOT NULL,
	"revenue" bigint NOT NULL,
	"external_id" text,
	"event_at" timestamp with time zone NOT NULL,
	"postback_raw_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_click_id_clicks_id_fk" FOREIGN KEY ("click_id") REFERENCES "public"."clicks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_postback_raw_id_postbacks_raw_id_fk" FOREIGN KEY ("postback_raw_id") REFERENCES "public"."postbacks_raw"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revenue_events_campaign_idx" ON "revenue_events" USING btree ("campaign_id","event_at");--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_events_external_uq" ON "revenue_events" USING btree ("click_id","external_id");