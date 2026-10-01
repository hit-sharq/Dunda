CREATE TABLE "dunda_billing_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"kind" text DEFAULT 'SUBSCRIPTION' NOT NULL,
	"status" text DEFAULT 'INITIATED' NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'KES' NOT NULL,
	"provider" text DEFAULT 'PESAPAL' NOT NULL,
	"provider_reference" text,
	"provider_transaction_id" text,
	"paid_at" timestamp with time zone,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"provider_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"billing_payment_id" text,
	"amount" integer NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"currency" text DEFAULT 'KES' NOT NULL,
	"status" text DEFAULT 'ISSUED' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dunda_payment_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text,
	"billing_payment_id" text,
	"payload" jsonb,
	"outcome" text DEFAULT 'ACCEPTED' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ALTER COLUMN "status" SET DEFAULT 'TRIAL';--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ALTER COLUMN "started_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ALTER COLUMN "started_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dunda_payments" ADD COLUMN "paid_by" text;--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ADD COLUMN "amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ADD COLUMN "currency" text DEFAULT 'KES' NOT NULL;--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ADD COLUMN "failed_payment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "dunda_billing_payments" ADD CONSTRAINT "dunda_billing_payments_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_billing_payments" ADD CONSTRAINT "dunda_billing_payments_subscription_id_dunda_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."dunda_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_invoices" ADD CONSTRAINT "dunda_invoices_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_invoices" ADD CONSTRAINT "dunda_invoices_subscription_id_dunda_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."dunda_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_invoices" ADD CONSTRAINT "dunda_invoices_billing_payment_id_dunda_billing_payments_id_fk" FOREIGN KEY ("billing_payment_id") REFERENCES "public"."dunda_billing_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_payment_notifications" ADD CONSTRAINT "dunda_payment_notifications_billing_payment_id_dunda_billing_payments_id_fk" FOREIGN KEY ("billing_payment_id") REFERENCES "public"."dunda_billing_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dunda_billing_payments_org" ON "dunda_billing_payments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dunda_billing_payments_txn" ON "dunda_billing_payments" USING btree ("provider","provider_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dunda_invoices_org_number" ON "dunda_invoices" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "dunda_payment_notifications_event" ON "dunda_payment_notifications" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "dunda_subscriptions_org" ON "dunda_subscriptions" USING btree ("organization_id");