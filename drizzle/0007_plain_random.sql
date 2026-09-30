CREATE TABLE "dunda_setup_token_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"clerk_user_id" text,
	"succeeded" boolean DEFAULT false NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_setup_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text DEFAULT 'CLAIM_OWNERSHIP' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_clerk_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dunda_setup_token_attempts" ADD CONSTRAINT "dunda_setup_token_attempts_token_id_dunda_setup_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."dunda_setup_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_setup_tokens" ADD CONSTRAINT "dunda_setup_tokens_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dunda_org_members_org_user" ON "dunda_organization_members" USING btree ("organization_id","clerk_user_id");