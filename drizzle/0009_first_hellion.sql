CREATE TABLE "dunda_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"monthly_price" integer DEFAULT 0 NOT NULL,
	"annual_price" integer DEFAULT 0 NOT NULL,
	"branch_limit" integer DEFAULT 1 NOT NULL,
	"user_limit" integer DEFAULT 5 NOT NULL,
	"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dunda_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ADD CONSTRAINT "dunda_subscriptions_plan_id_dunda_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."dunda_plans"("id") ON DELETE set null ON UPDATE no action;