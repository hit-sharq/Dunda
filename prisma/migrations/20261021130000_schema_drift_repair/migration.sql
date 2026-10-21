-- Repairs schema drift.
--
-- Two sets of columns were added to prisma/schema.prisma without a matching
-- migration, so the database never received them. The Prisma client built at
-- deploy time expected them, and every query that touched the affected tables
-- failed with "column does not exist", which is what was returning 500s on
-- /api/reservations, /api/admin/subscriptions and /api/admin/organizations.

-- Order-to-payment linking for the orders system.
ALTER TABLE "dunda_payment_attempts"
  ADD COLUMN "order_id" TEXT;

-- Waiter price override on order lines.
ALTER TABLE "dunda_order_items"
  ADD COLUMN "original_price" INTEGER,
  ADD COLUMN "price_overridden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "overridden_by_id" TEXT,
  ADD COLUMN "override_reason" TEXT;

-- The scheduled jobs table was created with plain TIMESTAMP(3) while the
-- schema has always asked for TIMESTAMPTZ(6). Align the column types so the
-- schema and the database agree.
ALTER TABLE "dunda_scheduled_jobs"
  ALTER COLUMN "last_run_at" TYPE TIMESTAMPTZ(6),
  ALTER COLUMN "locked_at" TYPE TIMESTAMPTZ(6),
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6),
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6);
