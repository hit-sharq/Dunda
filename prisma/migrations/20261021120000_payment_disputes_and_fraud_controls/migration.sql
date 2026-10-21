-- Payment fraud and dispute tracking.
--
-- Adds the card identity we need to answer a chargeback (which card, which
-- branch, which staff, which items), a risk score on every payment, a ledger
-- of disputes so a disputed payment cannot also be quietly refunded, and a
-- blocklist so a repeat offender is refused before the money is taken.

ALTER TABLE "dunda_payment_attempts"
  ADD COLUMN "ip_address" TEXT,
  ADD COLUMN "device_fingerprint" TEXT,
  ADD COLUMN "staff_id" TEXT;

ALTER TABLE "dunda_payments"
  ADD COLUMN "card_last4" TEXT,
  ADD COLUMN "card_brand" TEXT,
  ADD COLUMN "card_bin" TEXT,
  ADD COLUMN "ip_address" TEXT,
  ADD COLUMN "device_fingerprint" TEXT,
  ADD COLUMN "risk_score" INTEGER,
  ADD COLUMN "risk_flags" JSONB,
  ADD COLUMN "risk_action" TEXT DEFAULT 'ALLOW',
  ADD COLUMN "dispute_status" TEXT DEFAULT 'NONE',
  ADD COLUMN "evidence" JSONB;

CREATE TABLE "dunda_payment_disputes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reason_detail" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "liability" TEXT DEFAULT 'UNDETERMINED',
    "provider_reference" TEXT,
    "evidence" JSONB,
    "notes" TEXT,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6),
    "responded_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "responded_by_id" TEXT,

    CONSTRAINT "dunda_payment_disputes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dunda_card_blocklist" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'CARD',
    "card_bin" TEXT,
    "card_last4" TEXT,
    "fingerprint" TEXT,
    "ip_address" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "created_by_id" TEXT,

    CONSTRAINT "dunda_card_blocklist_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dunda_payment_disputes_org_status" ON "dunda_payment_disputes"("organization_id", "status");
CREATE INDEX "dunda_payment_disputes_payment" ON "dunda_payment_disputes"("payment_id");
CREATE INDEX "dunda_card_blocklist_org_status" ON "dunda_card_blocklist"("organization_id", "status");
CREATE INDEX "dunda_card_blocklist_bin" ON "dunda_card_blocklist"("card_bin");
CREATE INDEX "dunda_card_blocklist_last4" ON "dunda_card_blocklist"("card_last4");

ALTER TABLE "dunda_payment_disputes"
  ADD CONSTRAINT "dunda_pdisputes_branch_fk"
    FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT "dunda_pdisputes_org_fk"
    FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT "dunda_pdisputes_payment_fk"
    FOREIGN KEY ("payment_id") REFERENCES "dunda_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "dunda_pdisputes_staff_fk"
    FOREIGN KEY ("responded_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "dunda_card_blocklist"
  ADD CONSTRAINT "dunda_cblocklist_org_fk"
    FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT "dunda_cblocklist_staff_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- An open dispute must be obvious on the payment row itself.
CREATE INDEX "dunda_payments_dispute_status" ON "dunda_payments"("dispute_status");
