CREATE TYPE "public"."invoice_status" AS ENUM('open', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('stripe', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"org_id" text NOT NULL,
	"billing_entity" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"period_spend" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"amount_paid" bigint DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'open' NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"overdue_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"invoice_id" text,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"reference" text,
	"ledger_transaction_id" text,
	"advertiser_user_id" text,
	"admin_user_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "credit_limit" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "payment_terms_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_advertiser_user_id_advertiser_users_id_fk" FOREIGN KEY ("advertiser_user_id") REFERENCES "public"."advertiser_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_period_uq" ON "invoices" USING btree ("org_id","period_start");--> statement-breakpoint
CREATE INDEX "invoices_open_idx" ON "invoices" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "payments_org_idx" ON "payments" USING btree ("org_id","created_at");