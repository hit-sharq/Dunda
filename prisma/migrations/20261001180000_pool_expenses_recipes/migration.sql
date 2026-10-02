-- AlterTable
ALTER TABLE "dunda_orders" ADD COLUMN     "revenue_category" TEXT NOT NULL DEFAULT 'BAR',
ADD COLUMN     "tab_id" TEXT;

-- AlterTable
ALTER TABLE "dunda_organizations" ADD COLUMN     "last_activity_at" TIMESTAMPTZ(6),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspended_at" TIMESTAMPTZ(6),
ADD COLUMN     "suspended_reason" TEXT;

-- AlterTable
ALTER TABLE "dunda_payments" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'KES',
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "tab_id" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ(6),
ADD COLUMN     "voided_by_id" TEXT,
ALTER COLUMN "order_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "dunda_products" ADD COLUMN     "inventory_unit_id" TEXT,
ADD COLUMN     "minimum_stock" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "selling_unit_id" TEXT;

-- AlterTable
ALTER TABLE "dunda_reservations" ADD COLUMN     "ends_at" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "pool_table_id" TEXT,
ADD COLUMN     "starts_at" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "table_id" TEXT;

-- AlterTable
ALTER TABLE "dunda_tabs" ADD COLUMN     "allowed_on_account" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "amount_paid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bar_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "closed_by_id" TEXT,
ADD COLUMN     "customer_id" TEXT,
ADD COLUMN     "food_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "outstanding" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pool_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "staff_id" TEXT;

-- CreateTable
CREATE TABLE "dunda_event_tickets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "checked_in_by_id" TEXT,
    "code" TEXT NOT NULL,
    "guest_name" TEXT NOT NULL,
    "phone" TEXT,
    "ticket_type" TEXT NOT NULL DEFAULT 'GENERAL',
    "price" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "sold_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_at" TIMESTAMPTZ(6),
    "branch_id" TEXT,

    CONSTRAINT "dunda_event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_event_guest_list" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "checked_in_by_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "vip_package_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "checked_in_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "branch_id" TEXT,

    CONSTRAINT "dunda_event_guest_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_expenses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "recorded_by_id" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "expense_date" TIMESTAMPTZ(6) NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "vendor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_payment_attempts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "payment_id" TEXT,
    "billing_payment_id" TEXT,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "method" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "reference" TEXT,
    "failure_reason" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "dunda_payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_payment_provider_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "billing_payment_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'CLUB_PAYMENT',
    "provider" TEXT NOT NULL,
    "provider_transaction_id" TEXT NOT NULL,
    "reference" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" TEXT NOT NULL,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "raw_status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_payment_provider_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_receipts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "tab_id" TEXT,
    "order_id" TEXT,
    "payment_id" TEXT,
    "customer_id" TEXT,
    "issued_by_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "items_subtotal" INTEGER NOT NULL DEFAULT 0,
    "pool_charges" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "service_charge" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "amount_paid" INTEGER NOT NULL DEFAULT 0,
    "outstanding" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "payment_method" TEXT,
    "payment_reference" TEXT,
    "voided_at" TIMESTAMPTZ(6),
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_unit_conversions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "from_unit_id" TEXT NOT NULL,
    "to_unit_id" TEXT NOT NULL,
    "factor" DECIMAL(14,6) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_recipes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "output_quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "waste_factor" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "note" TEXT,

    CONSTRAINT "dunda_recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_pool_tables" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "base_rate" INTEGER NOT NULL DEFAULT 0,
    "minimum_minutes" INTEGER NOT NULL DEFAULT 60,
    "rounding_minutes" INTEGER NOT NULL DEFAULT 30,
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 140,
    "height" INTEGER NOT NULL DEFAULT 140,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_pool_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_pool_rate_rules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "pool_table_id" TEXT,
    "name" TEXT NOT NULL,
    "weekday" INTEGER,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "hourly_rate" INTEGER NOT NULL,
    "minimum_minutes" INTEGER NOT NULL DEFAULT 60,
    "rounding_minutes" INTEGER NOT NULL DEFAULT 30,
    "rounding_mode" TEXT NOT NULL DEFAULT 'CEIL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_pool_rate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_pool_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "pool_table_id" TEXT NOT NULL,
    "tab_id" TEXT,
    "customer_id" TEXT,
    "started_by_id" TEXT,
    "ended_by_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMPTZ(6),
    "resumed_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "paused_seconds" INTEGER NOT NULL DEFAULT 0,
    "actual_seconds" INTEGER NOT NULL DEFAULT 0,
    "billable_minutes" INTEGER NOT NULL DEFAULT 0,
    "hourly_rate" INTEGER NOT NULL DEFAULT 0,
    "charge" INTEGER NOT NULL DEFAULT 0,
    "charged" BOOLEAN NOT NULL DEFAULT false,
    "charged_at" TIMESTAMPTZ(6),
    "rate_rule_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_pool_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_organization_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "tax_rate" INTEGER NOT NULL DEFAULT 16,
    "tax_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "service_charge_rate" INTEGER NOT NULL DEFAULT 10,
    "service_charge_mode" TEXT NOT NULL DEFAULT 'PERCENT',
    "receipt_footer" TEXT,
    "invoice_footer" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_organization_features" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_organization_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_platform_users" (
    "id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PLATFORM_ADMIN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_support_tickets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "opened_by_clerk_user_id" TEXT,
    "assigned_to_id" TEXT,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'CUSTOMER_ISSUE',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "body" TEXT NOT NULL,
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "dunda_support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_platform_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "organization_id" TEXT,
    "actor_clerk_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "detail" TEXT,
    "previous_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dunda_event_tickets_org_event" ON "dunda_event_tickets"("organization_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_event_tickets_event_code" ON "dunda_event_tickets"("event_id", "code");

-- CreateIndex
CREATE INDEX "dunda_event_guest_list_org_event" ON "dunda_event_guest_list"("organization_id", "event_id");

-- CreateIndex
CREATE INDEX "dunda_expenses_org_date" ON "dunda_expenses"("organization_id", "expense_date");

-- CreateIndex
CREATE INDEX "dunda_expenses_org_category" ON "dunda_expenses"("organization_id", "category");

-- CreateIndex
CREATE INDEX "dunda_payment_attempts_org_requested" ON "dunda_payment_attempts"("organization_id", "requested_at");

-- CreateIndex
CREATE INDEX "dunda_ppt_org_created" ON "dunda_payment_provider_transactions"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_ppt_provider_txn" ON "dunda_payment_provider_transactions"("provider", "provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_receipts_org_number" ON "dunda_receipts"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_unit_conversions_product_from_to" ON "dunda_unit_conversions"("product_id", "from_unit_id", "to_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_recipes_product_id_key" ON "dunda_recipes"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_recipe_ingredients_recipe_product" ON "dunda_recipe_ingredients"("recipe_id", "product_id");

-- CreateIndex
CREATE INDEX "dunda_pool_tables_org_status" ON "dunda_pool_tables"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_pool_tables_branch_name" ON "dunda_pool_tables"("branch_id", "name");

-- CreateIndex
CREATE INDEX "dunda_pool_rate_rules_org_branch" ON "dunda_pool_rate_rules"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "dunda_pool_sessions_org_status" ON "dunda_pool_sessions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "dunda_pool_sessions_table_started" ON "dunda_pool_sessions"("pool_table_id", "started_at");

-- CreateIndex
CREATE INDEX "dunda_pool_sessions_tab" ON "dunda_pool_sessions"("tab_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_org_settings_org_unique" ON "dunda_organization_settings"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_org_features_org_module" ON "dunda_organization_features"("organization_id", "module");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_platform_users_clerk_user_id_unique" ON "dunda_platform_users"("clerk_user_id");

-- CreateIndex
CREATE INDEX "dunda_support_tickets_status" ON "dunda_support_tickets"("status");

-- CreateIndex
CREATE INDEX "dunda_platform_audit_logs_org_created" ON "dunda_platform_audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "dunda_platform_audit_logs_created" ON "dunda_platform_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "dunda_customers_org_phone" ON "dunda_customers"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "dunda_orders_org_status" ON "dunda_orders"("organization_id", "status");

-- CreateIndex
CREATE INDEX "dunda_orders_org_created" ON "dunda_orders"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "dunda_organizations_status" ON "dunda_organizations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_payments_idempotency_key_unique" ON "dunda_payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "dunda_payments_org_paid_at" ON "dunda_payments"("organization_id", "paid_at");

-- CreateIndex
CREATE INDEX "dunda_payments_org_tab" ON "dunda_payments"("organization_id", "tab_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_product_units_product_name" ON "dunda_product_units"("product_id", "name");

-- CreateIndex
CREATE INDEX "dunda_products_org_category" ON "dunda_products"("organization_id", "category_id");

-- CreateIndex
CREATE INDEX "dunda_products_org_sku" ON "dunda_products"("organization_id", "sku");

-- CreateIndex
CREATE INDEX "dunda_reservations_org_starts" ON "dunda_reservations"("organization_id", "starts_at");

-- CreateIndex
CREATE INDEX "dunda_reservations_table_starts" ON "dunda_reservations"("table_id", "starts_at");

-- CreateIndex
CREATE INDEX "dunda_reservations_pool_starts" ON "dunda_reservations"("pool_table_id", "starts_at");

-- CreateIndex
CREATE INDEX "dunda_staff_org_branch_status" ON "dunda_staff"("organization_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "dunda_staff_org_role" ON "dunda_staff"("organization_id", "role_id");

-- CreateIndex
CREATE INDEX "dunda_tables_org_status" ON "dunda_tables"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_tables_branch_name" ON "dunda_tables"("branch_id", "name");

-- CreateIndex
CREATE INDEX "dunda_tabs_org_status" ON "dunda_tabs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "dunda_tabs_org_branch_status" ON "dunda_tabs"("organization_id", "branch_id", "status");

-- AddForeignKey
ALTER TABLE "dunda_event_tickets" ADD CONSTRAINT "dunda_event_tickets_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_tickets" ADD CONSTRAINT "dunda_event_tickets_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "dunda_customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_tickets" ADD CONSTRAINT "dunda_event_tickets_event_id_dunda_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "dunda_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_tickets" ADD CONSTRAINT "dunda_event_tickets_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_tickets" ADD CONSTRAINT "dunda_event_tickets_checked_in_by_id_dunda_staff_id_fk" FOREIGN KEY ("checked_in_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_guest_list" ADD CONSTRAINT "dunda_event_guest_list_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_guest_list" ADD CONSTRAINT "dunda_event_guest_list_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "dunda_customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_guest_list" ADD CONSTRAINT "dunda_event_guest_list_event_id_dunda_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "dunda_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_guest_list" ADD CONSTRAINT "dunda_egl_org_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_guest_list" ADD CONSTRAINT "dunda_event_guest_list_checked_in_by_id_dunda_staff_id_fk" FOREIGN KEY ("checked_in_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_expenses" ADD CONSTRAINT "dunda_expenses_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_expenses" ADD CONSTRAINT "dunda_expenses_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_expenses" ADD CONSTRAINT "dunda_expenses_recorded_by_id_dunda_staff_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_tab_id_dunda_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "dunda_tabs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payments" ADD CONSTRAINT "dunda_payments_tab_id_dunda_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "dunda_tabs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payment_attempts" ADD CONSTRAINT "dunda_payment_attempts_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payment_attempts" ADD CONSTRAINT "dunda_pa_org_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payment_attempts" ADD CONSTRAINT "dunda_payment_attempts_payment_id_dunda_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "dunda_payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payment_attempts" ADD CONSTRAINT "dunda_pa_billing_payment_id_fk" FOREIGN KEY ("billing_payment_id") REFERENCES "dunda_billing_payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payment_provider_transactions" ADD CONSTRAINT "dunda_ppt_billing_payment_id_dunda_billing_payments_id_fk" FOREIGN KEY ("billing_payment_id") REFERENCES "dunda_billing_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payment_provider_transactions" ADD CONSTRAINT "dunda_ppt_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payment_provider_transactions" ADD CONSTRAINT "dunda_ppt_payment_id_dunda_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "dunda_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_receipts" ADD CONSTRAINT "dunda_receipts_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_receipts" ADD CONSTRAINT "dunda_receipts_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "dunda_customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_receipts" ADD CONSTRAINT "dunda_receipts_order_id_dunda_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "dunda_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_receipts" ADD CONSTRAINT "dunda_receipts_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_receipts" ADD CONSTRAINT "dunda_receipts_payment_id_dunda_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "dunda_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_receipts" ADD CONSTRAINT "dunda_receipts_issued_by_id_dunda_staff_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_receipts" ADD CONSTRAINT "dunda_receipts_tab_id_dunda_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "dunda_tabs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_products" ADD CONSTRAINT "dunda_products_inventory_unit_id_dunda_product_units_id_fk" FOREIGN KEY ("inventory_unit_id") REFERENCES "dunda_product_units"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_products" ADD CONSTRAINT "dunda_products_selling_unit_id_dunda_product_units_id_fk" FOREIGN KEY ("selling_unit_id") REFERENCES "dunda_product_units"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_unit_conversions" ADD CONSTRAINT "dunda_unit_conversions_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_unit_conversions" ADD CONSTRAINT "dunda_uc_org_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_unit_conversions" ADD CONSTRAINT "dunda_unit_conversions_from_unit_id_dunda_product_units_id_fk" FOREIGN KEY ("from_unit_id") REFERENCES "dunda_product_units"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_unit_conversions" ADD CONSTRAINT "dunda_unit_conversions_to_unit_id_dunda_product_units_id_fk" FOREIGN KEY ("to_unit_id") REFERENCES "dunda_product_units"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_recipes" ADD CONSTRAINT "dunda_recipes_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_recipes" ADD CONSTRAINT "dunda_recipes_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_recipe_ingredients" ADD CONSTRAINT "dunda_recipe_ingredients_recipe_id_dunda_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "dunda_recipes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_recipe_ingredients" ADD CONSTRAINT "dunda_recipe_ingredients_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_recipe_ingredients" ADD CONSTRAINT "dunda_recipe_ingredients_unit_id_dunda_product_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "dunda_product_units"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_reservations" ADD CONSTRAINT "dunda_reservations_table_id_dunda_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "dunda_tables"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_reservations" ADD CONSTRAINT "dunda_reservations_pool_table_id_dunda_pool_tables_id_fk" FOREIGN KEY ("pool_table_id") REFERENCES "dunda_pool_tables"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_tables" ADD CONSTRAINT "dunda_pool_tables_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_tables" ADD CONSTRAINT "dunda_pool_tables_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_rate_rules" ADD CONSTRAINT "dunda_pool_rate_rules_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_rate_rules" ADD CONSTRAINT "dunda_pool_rate_rules_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_rate_rules" ADD CONSTRAINT "dunda_pool_rate_rules_pool_table_id_dunda_pool_tables_id_fk" FOREIGN KEY ("pool_table_id") REFERENCES "dunda_pool_tables"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_sessions" ADD CONSTRAINT "dunda_pool_sessions_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_sessions" ADD CONSTRAINT "dunda_pool_sessions_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "dunda_customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_sessions" ADD CONSTRAINT "dunda_pool_sessions_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_sessions" ADD CONSTRAINT "dunda_pool_sessions_pool_table_id_dunda_pool_tables_id_fk" FOREIGN KEY ("pool_table_id") REFERENCES "dunda_pool_tables"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_sessions" ADD CONSTRAINT "dunda_pool_sessions_rate_rule_id_dunda_pool_rate_rules_id_fk" FOREIGN KEY ("rate_rule_id") REFERENCES "dunda_pool_rate_rules"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_sessions" ADD CONSTRAINT "dunda_pool_sessions_started_by_id_dunda_staff_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_sessions" ADD CONSTRAINT "dunda_pool_sessions_ended_by_id_dunda_staff_id_fk" FOREIGN KEY ("ended_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_pool_sessions" ADD CONSTRAINT "dunda_pool_sessions_tab_id_dunda_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "dunda_tabs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tabs" ADD CONSTRAINT "dunda_tabs_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "dunda_customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tabs" ADD CONSTRAINT "dunda_tabs_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_organization_settings" ADD CONSTRAINT "dunda_org_settings_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_organization_features" ADD CONSTRAINT "dunda_org_features_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_support_tickets" ADD CONSTRAINT "dunda_support_tickets_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_support_tickets" ADD CONSTRAINT "dunda_support_tickets_assigned_to_id_dunda_platform_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "dunda_platform_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_platform_audit_logs" ADD CONSTRAINT "dunda_pal_org_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_platform_audit_logs" ADD CONSTRAINT "dunda_platform_audit_logs_actor_id_dunda_platform_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "dunda_platform_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

