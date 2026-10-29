CREATE TYPE "public"."token_purpose" AS ENUM('invite', 'reset');--> statement-breakpoint
CREATE TABLE "advertiser_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"advertiser_user_id" text NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "low_balance_threshold" bigint DEFAULT 100000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "low_balance_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "advertiser_tokens" ADD CONSTRAINT "advertiser_tokens_advertiser_user_id_advertiser_users_id_fk" FOREIGN KEY ("advertiser_user_id") REFERENCES "public"."advertiser_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advertiser_tokens_user_idx" ON "advertiser_tokens" USING btree ("advertiser_user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_messages_due_idx" ON "email_messages" USING btree ("status","next_attempt_at");