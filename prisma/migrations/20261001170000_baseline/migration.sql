-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "dunda_audit_action" AS ENUM ('LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'VOID', 'REFUND', 'ADJUST', 'APPROVE', 'DISCARD');

-- CreateEnum
CREATE TYPE "dunda_customer_vip_level" AS ENUM ('NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "dunda_event_status" AS ENUM ('DRAFT', 'UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "dunda_notification_type" AS ENUM ('ORDER_READY', 'RESERVATION', 'LOW_STOCK', 'INVENTORY_DISCREPANCY', 'APPROVAL_REQUEST', 'STOCK_TRANSFER', 'EVENT_REMINDER');

-- CreateEnum
CREATE TYPE "dunda_order_status" AS ENUM ('DRAFT', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "dunda_payment_method" AS ENUM ('CASH', 'MPESA', 'CARD', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "dunda_payment_status" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "dunda_reservation_status" AS ENUM ('PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "dunda_stock_movement_type" AS ENUM ('PURCHASE', 'SALE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'WASTE', 'RETURN', 'STOCK_COUNT');

-- CreateTable
CREATE TABLE "dunda_activity" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "amount" INTEGER,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "staff_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "detail" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_billing_payments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "provider" TEXT NOT NULL DEFAULT 'PESAPAL',
    "provider_reference" TEXT,
    "provider_transaction_id" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "refunded_amount" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "provider_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_billing_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_branch_members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_branch_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_branches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "phone" TEXT,
    "email" TEXT,
    "active_tables" INTEGER NOT NULL DEFAULT 0,
    "total_tables" INTEGER NOT NULL DEFAULT 0,
    "revenue_today" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_categories" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6f9fb2',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "group" TEXT,
    "station" TEXT,

    CONSTRAINT "dunda_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_customers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "vip_level" TEXT NOT NULL DEFAULT 'NONE',
    "total_visits" INTEGER NOT NULL DEFAULT 0,
    "total_spend" INTEGER NOT NULL DEFAULT 0,
    "last_visit_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_document_counters" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_document_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_event_reservations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "vip_package_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_event_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "date" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_floor_sections" (
    "id" TEXT NOT NULL,
    "floor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#f07a4b',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dunda_floor_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_floors" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dunda_floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_inventory_alerts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "stock" DECIMAL(12,2) NOT NULL,
    "minimum" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'LOW',

    CONSTRAINT "dunda_inventory_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_inventory_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "product_id" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "current_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reorder_level" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "supplier_id" TEXT,

    CONSTRAINT "dunda_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "billing_payment_id" TEXT,
    "amount" INTEGER NOT NULL,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "period_start" TIMESTAMPTZ(6),
    "period_end" TIMESTAMPTZ(6),
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(6),

    CONSTRAINT "dunda_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_notifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "staff_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" TEXT NOT NULL DEFAULT 'false',
    "reference_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_order_item_units" (
    "id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "unit_name" TEXT NOT NULL,
    "conversion_factor" DECIMAL(12,4) NOT NULL,
    "quantity_in_base_unit" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "dunda_order_item_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "notes" TEXT,
    "category_id" TEXT,

    CONSTRAINT "dunda_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_order_ticket_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "order_item_id" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "tab_item_id" TEXT,

    CONSTRAINT "dunda_order_ticket_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_order_tickets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "order_id" TEXT,
    "station" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tab_id" TEXT,

    CONSTRAINT "dunda_order_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "table_name" TEXT,
    "customer_id" TEXT,
    "staff_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "service_charge" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "table_id" TEXT,

    CONSTRAINT "dunda_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_organization_members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "tax_rate" INTEGER NOT NULL DEFAULT 16,
    "service_charge_rate" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_payment_notifications" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT,
    "billing_payment_id" TEXT,
    "payload" JSONB,
    "outcome" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "error" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "dunda_payment_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_payments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESSFUL',
    "cashier_id" TEXT,
    "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_by" TEXT,

    CONSTRAINT "dunda_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_permissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,

    CONSTRAINT "dunda_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthly_price" INTEGER NOT NULL DEFAULT 0,
    "annual_price" INTEGER NOT NULL DEFAULT 0,
    "branch_limit" INTEGER NOT NULL DEFAULT 1,
    "user_limit" INTEGER NOT NULL DEFAULT 5,
    "modules" JSONB NOT NULL DEFAULT '[]',
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_product_barcodes" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,

    CONSTRAINT "dunda_product_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_product_branch_availability" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "price" INTEGER,
    "track_inventory" BOOLEAN NOT NULL DEFAULT true,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dunda_product_branch_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_product_units" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "conversion_factor" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "is_base_unit" BOOLEAN NOT NULL DEFAULT false,
    "selling_price" INTEGER NOT NULL,
    "cost" INTEGER,
    "whole_units_only" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dunda_product_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_products" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "sku" TEXT,
    "barcode" TEXT,
    "description" TEXT,
    "image" TEXT,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL DEFAULT 16,
    "track_inventory" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "available" TEXT NOT NULL DEFAULT 'true',
    "stock" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "base_unit" TEXT NOT NULL DEFAULT 'piece',
    "accent" TEXT NOT NULL DEFAULT 'amber',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_refunds" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approved_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_reservations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reservation_date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "guests" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "dunda_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_owner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dunda_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_setup_token_attempts" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "clerk_user_id" TEXT,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_setup_token_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_setup_tokens" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'CLAIM_OWNERSHIP',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "consumed_by_clerk_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_setup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_staff" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "clerk_user_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_staff_shifts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "clock_in_at" TIMESTAMPTZ(6),
    "clock_out_at" TIMESTAMPTZ(6),
    "break_start_at" TIMESTAMPTZ(6),
    "break_end_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_staff_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_stock_count_items" (
    "id" TEXT NOT NULL,
    "stock_count_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "expected_quantity" DECIMAL(12,2) NOT NULL,
    "actual_quantity" DECIMAL(12,2),
    "variance" DECIMAL(12,2),

    CONSTRAINT "dunda_stock_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_stock_counts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "counted_by_id" TEXT,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_stock_movements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "quantity_in_base_unit" DECIMAL(12,4) NOT NULL,
    "unit_id" TEXT,
    "reference_id" TEXT,
    "reason" TEXT,
    "staff_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "quantity_in_base_unit" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "dunda_stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_stock_transfers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "source_branch_id" TEXT NOT NULL,
    "destination_branch_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_subscriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "billing_cycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "branch_limit" INTEGER NOT NULL DEFAULT 1,
    "user_limit" INTEGER NOT NULL DEFAULT 5,
    "current_branches" INTEGER NOT NULL DEFAULT 0,
    "current_users" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6),
    "renews_at" TIMESTAMPTZ(6),
    "plan_id" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "trial_ends_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "failed_payment_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_suppliers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunda_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_tab_item_units" (
    "id" TEXT NOT NULL,
    "tab_item_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "unit_name" TEXT NOT NULL,
    "conversion_factor" INTEGER NOT NULL,
    "quantity_in_base_unit" INTEGER NOT NULL,

    CONSTRAINT "dunda_tab_item_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_tab_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tab_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "unit_id" TEXT,
    "unit_name" TEXT,
    "notes" TEXT,

    CONSTRAINT "dunda_tab_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_tables" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "floor_id" TEXT,
    "floor_section_id" TEXT,
    "name" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "total" INTEGER NOT NULL DEFAULT 0,
    "tab_id" TEXT,
    "customer" TEXT,
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 120,
    "height" INTEGER NOT NULL DEFAULT 120,

    CONSTRAINT "dunda_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_tabs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "service_charge" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "table_id" TEXT,

    CONSTRAINT "dunda_tabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunda_vip_packages" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minimum_spend" INTEGER NOT NULL DEFAULT 0,
    "guest_count" INTEGER NOT NULL DEFAULT 1,
    "table_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "dunda_vip_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dunda_billing_payments_org" ON "dunda_billing_payments"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_billing_payments_txn" ON "dunda_billing_payments"("provider", "provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_invoices_org_number" ON "dunda_invoices"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_orders_number_unique" ON "dunda_orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_org_members_org_user" ON "dunda_organization_members"("organization_id", "clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_organizations_slug_unique" ON "dunda_organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_payment_notifications_event" ON "dunda_payment_notifications"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_permissions_name_unique" ON "dunda_permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_plans_code_unique" ON "dunda_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_product_barcodes_barcode_unique" ON "dunda_product_barcodes"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_roles_name_unique" ON "dunda_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_staff_clerk_user_id_unique" ON "dunda_staff"("clerk_user_id");

-- CreateIndex
CREATE INDEX "dunda_subscriptions_org" ON "dunda_subscriptions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "dunda_tabs_number_unique" ON "dunda_tabs"("number");

-- AddForeignKey
ALTER TABLE "dunda_activity" ADD CONSTRAINT "dunda_activity_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_activity" ADD CONSTRAINT "dunda_activity_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_audit_logs" ADD CONSTRAINT "dunda_audit_logs_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_audit_logs" ADD CONSTRAINT "dunda_audit_logs_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_audit_logs" ADD CONSTRAINT "dunda_audit_logs_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_billing_payments" ADD CONSTRAINT "dunda_billing_payments_organization_id_dunda_organizations_id_f" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_billing_payments" ADD CONSTRAINT "dunda_billing_payments_subscription_id_dunda_subscriptions_id_f" FOREIGN KEY ("subscription_id") REFERENCES "dunda_subscriptions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_branch_members" ADD CONSTRAINT "dunda_branch_members_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_branch_members" ADD CONSTRAINT "dunda_branch_members_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_branch_members" ADD CONSTRAINT "dunda_branch_members_role_id_dunda_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "dunda_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_branches" ADD CONSTRAINT "dunda_branches_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_categories" ADD CONSTRAINT "dunda_categories_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_customers" ADD CONSTRAINT "dunda_customers_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_customers" ADD CONSTRAINT "dunda_customers_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_document_counters" ADD CONSTRAINT "dunda_document_counters_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_document_counters" ADD CONSTRAINT "dunda_document_counters_organization_id_dunda_organizations_id_" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_reservations" ADD CONSTRAINT "dunda_event_reservations_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "dunda_customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_event_reservations" ADD CONSTRAINT "dunda_event_reservations_event_id_dunda_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "dunda_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_events" ADD CONSTRAINT "dunda_events_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_events" ADD CONSTRAINT "dunda_events_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_floor_sections" ADD CONSTRAINT "dunda_floor_sections_floor_id_dunda_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "dunda_floors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_floors" ADD CONSTRAINT "dunda_floors_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_inventory_alerts" ADD CONSTRAINT "dunda_inventory_alerts_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_inventory_alerts" ADD CONSTRAINT "dunda_inventory_alerts_organization_id_dunda_organizations_id_f" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_inventory_alerts" ADD CONSTRAINT "dunda_inventory_alerts_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_inventory_items" ADD CONSTRAINT "dunda_inventory_items_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_inventory_items" ADD CONSTRAINT "dunda_inventory_items_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_inventory_items" ADD CONSTRAINT "dunda_inventory_items_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_invoices" ADD CONSTRAINT "dunda_invoices_billing_payment_id_dunda_billing_payments_id_fk" FOREIGN KEY ("billing_payment_id") REFERENCES "dunda_billing_payments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_invoices" ADD CONSTRAINT "dunda_invoices_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_invoices" ADD CONSTRAINT "dunda_invoices_subscription_id_dunda_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "dunda_subscriptions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_notifications" ADD CONSTRAINT "dunda_notifications_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_notifications" ADD CONSTRAINT "dunda_notifications_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_notifications" ADD CONSTRAINT "dunda_notifications_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_item_units" ADD CONSTRAINT "dunda_order_item_units_order_item_id_dunda_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "dunda_order_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_items" ADD CONSTRAINT "dunda_order_items_order_id_dunda_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "dunda_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_items" ADD CONSTRAINT "dunda_order_items_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_ticket_items" ADD CONSTRAINT "dunda_order_ticket_items_order_item_id_dunda_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "dunda_order_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_ticket_items" ADD CONSTRAINT "dunda_order_ticket_items_organization_id_dunda_organizations_id" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_ticket_items" ADD CONSTRAINT "dunda_order_ticket_items_tab_item_id_dunda_tab_items_id_fk" FOREIGN KEY ("tab_item_id") REFERENCES "dunda_tab_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_ticket_items" ADD CONSTRAINT "dunda_order_ticket_items_ticket_id_dunda_order_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "dunda_order_tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_tickets" ADD CONSTRAINT "dunda_order_tickets_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_tickets" ADD CONSTRAINT "dunda_order_tickets_order_id_dunda_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "dunda_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_tickets" ADD CONSTRAINT "dunda_order_tickets_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_order_tickets" ADD CONSTRAINT "dunda_order_tickets_tab_id_dunda_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "dunda_tabs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "dunda_customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_table_id_dunda_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "dunda_tables"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_organization_members" ADD CONSTRAINT "dunda_organization_members_organization_id_dunda_organizations_" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_organization_members" ADD CONSTRAINT "dunda_organization_members_role_id_dunda_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "dunda_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payment_notifications" ADD CONSTRAINT "dunda_payment_notifications_billing_payment_id_dunda_billing_pa" FOREIGN KEY ("billing_payment_id") REFERENCES "dunda_billing_payments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payments" ADD CONSTRAINT "dunda_payments_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payments" ADD CONSTRAINT "dunda_payments_cashier_id_dunda_staff_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payments" ADD CONSTRAINT "dunda_payments_order_id_dunda_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "dunda_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_payments" ADD CONSTRAINT "dunda_payments_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_product_barcodes" ADD CONSTRAINT "dunda_product_barcodes_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_product_barcodes" ADD CONSTRAINT "dunda_product_barcodes_unit_id_dunda_product_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "dunda_product_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_product_branch_availability" ADD CONSTRAINT "dunda_product_branch_availability_branch_id_dunda_branches_id_f" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_product_branch_availability" ADD CONSTRAINT "dunda_product_branch_availability_product_id_dunda_products_id_" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_product_units" ADD CONSTRAINT "dunda_product_units_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_products" ADD CONSTRAINT "dunda_products_category_id_dunda_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "dunda_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_products" ADD CONSTRAINT "dunda_products_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_refunds" ADD CONSTRAINT "dunda_refunds_approved_by_id_dunda_staff_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_refunds" ADD CONSTRAINT "dunda_refunds_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_refunds" ADD CONSTRAINT "dunda_refunds_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_refunds" ADD CONSTRAINT "dunda_refunds_payment_id_dunda_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "dunda_payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_reservations" ADD CONSTRAINT "dunda_reservations_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_reservations" ADD CONSTRAINT "dunda_reservations_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "dunda_customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_reservations" ADD CONSTRAINT "dunda_reservations_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_role_permissions" ADD CONSTRAINT "dunda_role_permissions_permission_id_dunda_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "dunda_permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_role_permissions" ADD CONSTRAINT "dunda_role_permissions_role_id_dunda_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "dunda_roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_setup_token_attempts" ADD CONSTRAINT "dunda_setup_token_attempts_token_id_dunda_setup_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "dunda_setup_tokens"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_setup_tokens" ADD CONSTRAINT "dunda_setup_tokens_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_staff" ADD CONSTRAINT "dunda_staff_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_staff" ADD CONSTRAINT "dunda_staff_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_staff" ADD CONSTRAINT "dunda_staff_role_id_dunda_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "dunda_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_staff_shifts" ADD CONSTRAINT "dunda_staff_shifts_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_staff_shifts" ADD CONSTRAINT "dunda_staff_shifts_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_staff_shifts" ADD CONSTRAINT "dunda_staff_shifts_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_count_items" ADD CONSTRAINT "dunda_stock_count_items_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_count_items" ADD CONSTRAINT "dunda_stock_count_items_stock_count_id_dunda_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "dunda_stock_counts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_counts" ADD CONSTRAINT "dunda_stock_counts_approved_by_id_dunda_staff_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_counts" ADD CONSTRAINT "dunda_stock_counts_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_counts" ADD CONSTRAINT "dunda_stock_counts_counted_by_id_dunda_staff_id_fk" FOREIGN KEY ("counted_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_counts" ADD CONSTRAINT "dunda_stock_counts_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_movements" ADD CONSTRAINT "dunda_stock_movements_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_movements" ADD CONSTRAINT "dunda_stock_movements_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_movements" ADD CONSTRAINT "dunda_stock_movements_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_movements" ADD CONSTRAINT "dunda_stock_movements_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_transfer_items" ADD CONSTRAINT "dunda_stock_transfer_items_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_transfer_items" ADD CONSTRAINT "dunda_stock_transfer_items_transfer_id_dunda_stock_transfers_id" FOREIGN KEY ("transfer_id") REFERENCES "dunda_stock_transfers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_transfers" ADD CONSTRAINT "dunda_stock_transfers_approved_by_id_dunda_staff_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "dunda_staff"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_transfers" ADD CONSTRAINT "dunda_stock_transfers_destination_branch_id_dunda_branches_id_f" FOREIGN KEY ("destination_branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_transfers" ADD CONSTRAINT "dunda_stock_transfers_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_stock_transfers" ADD CONSTRAINT "dunda_stock_transfers_source_branch_id_dunda_branches_id_fk" FOREIGN KEY ("source_branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_subscriptions" ADD CONSTRAINT "dunda_subscriptions_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_subscriptions" ADD CONSTRAINT "dunda_subscriptions_plan_id_dunda_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dunda_plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_suppliers" ADD CONSTRAINT "dunda_suppliers_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tab_item_units" ADD CONSTRAINT "dunda_tab_item_units_tab_item_id_dunda_tab_items_id_fk" FOREIGN KEY ("tab_item_id") REFERENCES "dunda_tab_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tab_items" ADD CONSTRAINT "dunda_tab_items_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tab_items" ADD CONSTRAINT "dunda_tab_items_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "dunda_products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tab_items" ADD CONSTRAINT "dunda_tab_items_tab_id_dunda_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "dunda_tabs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tables" ADD CONSTRAINT "dunda_tables_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tables" ADD CONSTRAINT "dunda_tables_floor_id_dunda_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "dunda_floors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tables" ADD CONSTRAINT "dunda_tables_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tabs" ADD CONSTRAINT "dunda_tabs_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tabs" ADD CONSTRAINT "dunda_tabs_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_tabs" ADD CONSTRAINT "dunda_tabs_table_id_dunda_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "dunda_tables"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_vip_packages" ADD CONSTRAINT "dunda_vip_packages_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "dunda_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dunda_vip_packages" ADD CONSTRAINT "dunda_vip_packages_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "dunda_organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

