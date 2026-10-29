CREATE TABLE "admin_login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clicks" ADD COLUMN "ip_risk" jsonb;--> statement-breakpoint
ALTER TABLE "clicks" ADD COLUMN "publisher_risk" integer;--> statement-breakpoint
CREATE INDEX "admin_login_attempts_email_idx" ON "admin_login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "admin_login_attempts_ip_idx" ON "admin_login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "clicks_ip_idx" ON "clicks" USING btree ("ip","created_at");