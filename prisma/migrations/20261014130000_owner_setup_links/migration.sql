ALTER TABLE "dunda_setup_tokens"
  DROP CONSTRAINT "dunda_setup_tokens_organization_id_dunda_organizations_id_fk",
  ALTER COLUMN "organization_id" DROP NOT NULL,
  ADD COLUMN "owner_email" TEXT,
  ADD COLUMN "owner_name" TEXT,
  ADD COLUMN "plan_id" TEXT,
  ADD COLUMN "created_by_clerk_user_id" TEXT,
  ADD CONSTRAINT "dunda_setup_tokens_organization_id_dunda_organizations_id_fk"
    FOREIGN KEY ("organization_id")
    REFERENCES "dunda_organizations"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "dunda_setup_tokens_token_hash_unique"
  ON "dunda_setup_tokens"("token_hash");