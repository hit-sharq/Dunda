CREATE TABLE "dunda_document_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"kind" text NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dunda_staff" ALTER COLUMN "clerk_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dunda_roles" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dunda_categories" ADD COLUMN "group" text;--> statement-breakpoint
ALTER TABLE "dunda_document_counters" ADD CONSTRAINT "dunda_document_counters_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_document_counters" ADD CONSTRAINT "dunda_document_counters_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "dunda_roles" SET "is_owner" = true WHERE lower("name") LIKE '%owner%' OR lower("name") = 'administrator';
--> statement-breakpoint
UPDATE "dunda_categories" SET "group" = 'drinks' WHERE lower("name") IN ('drinks','beverages','beer','spirits','cocktails','wine','soft drinks','liquor');--> statement-breakpoint
UPDATE "dunda_categories" SET "group" = 'food' WHERE lower("name") IN ('food','kitchen','grill','desserts','snacks','cigars','cigarettes');
