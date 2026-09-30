CREATE TYPE "public"."dunda_stock_movement_type" AS ENUM('PURCHASE', 'SALE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'WASTE', 'RETURN', 'STOCK_COUNT');--> statement-breakpoint
CREATE TYPE "public"."dunda_order_status" AS ENUM('DRAFT', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'PAYMENT_PENDING', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."dunda_customer_vip_level" AS ENUM('NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM');--> statement-breakpoint
CREATE TYPE "public"."dunda_event_status" AS ENUM('DRAFT', 'UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."dunda_reservation_status" AS ENUM('PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."dunda_payment_method" AS ENUM('CASH', 'MPESA', 'CARD', 'BANK_TRANSFER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."dunda_payment_status" AS ENUM('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."dunda_audit_action" AS ENUM('LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'VOID', 'REFUND', 'ADJUST', 'APPROVE', 'DISCARD');--> statement-breakpoint
CREATE TYPE "public"."dunda_notification_type" AS ENUM('ORDER_READY', 'RESERVATION', 'LOW_STOCK', 'INVENTORY_DISCREPANCY', 'APPROVAL_REQUEST', 'STOCK_TRANSFER', 'EVENT_REMINDER');--> statement-breakpoint
CREATE TABLE "dunda_branches" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text,
	"status" text DEFAULT 'LIVE' NOT NULL,
	"timezone" text DEFAULT 'Africa/Nairobi' NOT NULL,
	"phone" text,
	"email" text,
	"active_tables" integer DEFAULT 0 NOT NULL,
	"total_tables" integer DEFAULT 0 NOT NULL,
	"revenue_today" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_floor_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"floor_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#f07a4b' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_floors" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"domain" text,
	"currency" text DEFAULT 'KES' NOT NULL,
	"tax_rate" integer DEFAULT 16 NOT NULL,
	"service_charge_rate" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dunda_organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "dunda_branch_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	CONSTRAINT "dunda_permissions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "dunda_role_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"permission_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dunda_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "dunda_staff" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role_id" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"pin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dunda_staff_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "dunda_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6f9fb2' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_product_barcodes" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"barcode" text NOT NULL,
	"unit_id" text NOT NULL,
	CONSTRAINT "dunda_product_barcodes_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "dunda_product_branch_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"price" integer,
	"track_inventory" boolean DEFAULT true NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_product_units" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"conversion_factor" numeric(12, 4) DEFAULT '1' NOT NULL,
	"is_base_unit" boolean DEFAULT false NOT NULL,
	"selling_price" integer NOT NULL,
	"cost" integer,
	"whole_units_only" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_products" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text DEFAULT 'piece' NOT NULL,
	"sku" text,
	"barcode" text,
	"description" text,
	"image" text,
	"cost" integer DEFAULT 0 NOT NULL,
	"price" integer NOT NULL,
	"tax" integer DEFAULT 16 NOT NULL,
	"track_inventory" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"available" text DEFAULT 'true' NOT NULL,
	"stock" numeric(12, 2) DEFAULT '0' NOT NULL,
	"base_unit" text DEFAULT 'piece' NOT NULL,
	"accent" text DEFAULT 'amber' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_inventory_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"stock" numeric(12, 2) NOT NULL,
	"minimum" numeric(12, 2) NOT NULL,
	"unit" text NOT NULL,
	"severity" text DEFAULT 'LOW' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"product_id" text,
	"name" text NOT NULL,
	"category" text,
	"sku" text,
	"unit" text DEFAULT 'piece' NOT NULL,
	"current_quantity" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reorder_level" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cost" integer DEFAULT 0 NOT NULL,
	"supplier_id" text
);
--> statement-breakpoint
CREATE TABLE "dunda_stock_count_items" (
	"id" text PRIMARY KEY NOT NULL,
	"stock_count_id" text NOT NULL,
	"product_id" text NOT NULL,
	"expected_quantity" numeric(12, 2) NOT NULL,
	"actual_quantity" numeric(12, 2),
	"variance" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "dunda_stock_counts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"counted_by_id" text,
	"approved_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"product_id" text NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"quantity_in_base_unit" numeric(12, 4) NOT NULL,
	"unit_id" text,
	"reference_id" text,
	"reason" text,
	"staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_stock_transfer_items" (
	"id" text PRIMARY KEY NOT NULL,
	"transfer_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"quantity_in_base_unit" numeric(12, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_stock_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source_branch_id" text NOT NULL,
	"destination_branch_id" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"approved_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"phone" text,
	"email" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_tab_item_units" (
	"id" text PRIMARY KEY NOT NULL,
	"tab_item_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"unit_name" text NOT NULL,
	"conversion_factor" integer NOT NULL,
	"quantity_in_base_unit" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_tab_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tab_id" text NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"total" integer NOT NULL,
	"category" text NOT NULL,
	"unit_id" text,
	"unit_name" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "dunda_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"floor_id" text,
	"floor_section_id" text,
	"name" text NOT NULL,
	"section" text NOT NULL,
	"seats" integer DEFAULT 4 NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"tab_id" text,
	"customer" text,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 120 NOT NULL,
	"height" integer DEFAULT 120 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_tabs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"number" text NOT NULL,
	"customer" text NOT NULL,
	"table_name" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"service_charge" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "dunda_tabs_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "dunda_order_item_units" (
	"id" text PRIMARY KEY NOT NULL,
	"order_item_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"unit_name" text NOT NULL,
	"conversion_factor" numeric(12, 4) NOT NULL,
	"quantity_in_base_unit" numeric(12, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text NOT NULL,
	"unit_id" text,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"total" integer NOT NULL,
	"notes" text,
	"category_id" text
);
--> statement-breakpoint
CREATE TABLE "dunda_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"number" text NOT NULL,
	"table_name" text,
	"customer_id" text,
	"staff_id" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"service_charge" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dunda_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "dunda_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"vip_level" text DEFAULT 'NONE' NOT NULL,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"total_spend" integer DEFAULT 0 NOT NULL,
	"last_visit_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_event_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"guests" integer DEFAULT 1 NOT NULL,
	"vip_package_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"revenue" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"customer_id" text,
	"customer" text NOT NULL,
	"phone" text NOT NULL,
	"reservation_date" text NOT NULL,
	"time" text NOT NULL,
	"table_name" text NOT NULL,
	"guests" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_staff_shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"clock_in_at" timestamp with time zone,
	"clock_out_at" timestamp with time zone,
	"break_start_at" timestamp with time zone,
	"break_end_at" timestamp with time zone,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_vip_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"minimum_spend" integer DEFAULT 0 NOT NULL,
	"guest_count" integer DEFAULT 1 NOT NULL,
	"table_id" text,
	"status" text DEFAULT 'AVAILABLE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"order_id" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"status" text DEFAULT 'SUCCESSFUL' NOT NULL,
	"cashier_id" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"approved_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"amount" integer,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text,
	"staff_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"detail" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text,
	"staff_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"read" text DEFAULT 'false' NOT NULL,
	"reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunda_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan" text DEFAULT 'STARTER' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"billing_cycle" text DEFAULT 'MONTHLY' NOT NULL,
	"branch_limit" integer DEFAULT 1 NOT NULL,
	"user_limit" integer DEFAULT 5 NOT NULL,
	"current_branches" integer DEFAULT 0 NOT NULL,
	"current_users" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"renews_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dunda_branches" ADD CONSTRAINT "dunda_branches_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_floor_sections" ADD CONSTRAINT "dunda_floor_sections_floor_id_dunda_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."dunda_floors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_floors" ADD CONSTRAINT "dunda_floors_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_branch_members" ADD CONSTRAINT "dunda_branch_members_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_branch_members" ADD CONSTRAINT "dunda_branch_members_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_branch_members" ADD CONSTRAINT "dunda_branch_members_role_id_dunda_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."dunda_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_organization_members" ADD CONSTRAINT "dunda_organization_members_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_organization_members" ADD CONSTRAINT "dunda_organization_members_role_id_dunda_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."dunda_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_role_permissions" ADD CONSTRAINT "dunda_role_permissions_role_id_dunda_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."dunda_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_role_permissions" ADD CONSTRAINT "dunda_role_permissions_permission_id_dunda_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."dunda_permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_staff" ADD CONSTRAINT "dunda_staff_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_staff" ADD CONSTRAINT "dunda_staff_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_staff" ADD CONSTRAINT "dunda_staff_role_id_dunda_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."dunda_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_categories" ADD CONSTRAINT "dunda_categories_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_product_barcodes" ADD CONSTRAINT "dunda_product_barcodes_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."dunda_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_product_barcodes" ADD CONSTRAINT "dunda_product_barcodes_unit_id_dunda_product_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."dunda_product_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_product_branch_availability" ADD CONSTRAINT "dunda_product_branch_availability_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."dunda_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_product_branch_availability" ADD CONSTRAINT "dunda_product_branch_availability_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_product_units" ADD CONSTRAINT "dunda_product_units_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."dunda_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_products" ADD CONSTRAINT "dunda_products_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_products" ADD CONSTRAINT "dunda_products_category_id_dunda_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."dunda_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_inventory_alerts" ADD CONSTRAINT "dunda_inventory_alerts_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_inventory_alerts" ADD CONSTRAINT "dunda_inventory_alerts_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_inventory_alerts" ADD CONSTRAINT "dunda_inventory_alerts_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."dunda_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_inventory_items" ADD CONSTRAINT "dunda_inventory_items_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_inventory_items" ADD CONSTRAINT "dunda_inventory_items_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_inventory_items" ADD CONSTRAINT "dunda_inventory_items_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."dunda_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_count_items" ADD CONSTRAINT "dunda_stock_count_items_stock_count_id_dunda_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."dunda_stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_count_items" ADD CONSTRAINT "dunda_stock_count_items_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."dunda_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_counts" ADD CONSTRAINT "dunda_stock_counts_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_counts" ADD CONSTRAINT "dunda_stock_counts_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_counts" ADD CONSTRAINT "dunda_stock_counts_counted_by_id_dunda_staff_id_fk" FOREIGN KEY ("counted_by_id") REFERENCES "public"."dunda_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_counts" ADD CONSTRAINT "dunda_stock_counts_approved_by_id_dunda_staff_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."dunda_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_movements" ADD CONSTRAINT "dunda_stock_movements_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_movements" ADD CONSTRAINT "dunda_stock_movements_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_movements" ADD CONSTRAINT "dunda_stock_movements_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."dunda_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_movements" ADD CONSTRAINT "dunda_stock_movements_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."dunda_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_transfer_items" ADD CONSTRAINT "dunda_stock_transfer_items_transfer_id_dunda_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."dunda_stock_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_transfer_items" ADD CONSTRAINT "dunda_stock_transfer_items_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."dunda_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_transfers" ADD CONSTRAINT "dunda_stock_transfers_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_transfers" ADD CONSTRAINT "dunda_stock_transfers_source_branch_id_dunda_branches_id_fk" FOREIGN KEY ("source_branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_transfers" ADD CONSTRAINT "dunda_stock_transfers_destination_branch_id_dunda_branches_id_fk" FOREIGN KEY ("destination_branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_stock_transfers" ADD CONSTRAINT "dunda_stock_transfers_approved_by_id_dunda_staff_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."dunda_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_suppliers" ADD CONSTRAINT "dunda_suppliers_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_tab_item_units" ADD CONSTRAINT "dunda_tab_item_units_tab_item_id_dunda_tab_items_id_fk" FOREIGN KEY ("tab_item_id") REFERENCES "public"."dunda_tab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_tab_items" ADD CONSTRAINT "dunda_tab_items_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_tab_items" ADD CONSTRAINT "dunda_tab_items_tab_id_dunda_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."dunda_tabs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_tab_items" ADD CONSTRAINT "dunda_tab_items_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."dunda_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_tables" ADD CONSTRAINT "dunda_tables_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_tables" ADD CONSTRAINT "dunda_tables_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_tables" ADD CONSTRAINT "dunda_tables_floor_id_dunda_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."dunda_floors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_tabs" ADD CONSTRAINT "dunda_tabs_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_tabs" ADD CONSTRAINT "dunda_tabs_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_order_item_units" ADD CONSTRAINT "dunda_order_item_units_order_item_id_dunda_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."dunda_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_order_items" ADD CONSTRAINT "dunda_order_items_order_id_dunda_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."dunda_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_order_items" ADD CONSTRAINT "dunda_order_items_product_id_dunda_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."dunda_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."dunda_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."dunda_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_customers" ADD CONSTRAINT "dunda_customers_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_customers" ADD CONSTRAINT "dunda_customers_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_event_reservations" ADD CONSTRAINT "dunda_event_reservations_event_id_dunda_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."dunda_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_event_reservations" ADD CONSTRAINT "dunda_event_reservations_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."dunda_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_events" ADD CONSTRAINT "dunda_events_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_events" ADD CONSTRAINT "dunda_events_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_reservations" ADD CONSTRAINT "dunda_reservations_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_reservations" ADD CONSTRAINT "dunda_reservations_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_reservations" ADD CONSTRAINT "dunda_reservations_customer_id_dunda_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."dunda_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_staff_shifts" ADD CONSTRAINT "dunda_staff_shifts_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_staff_shifts" ADD CONSTRAINT "dunda_staff_shifts_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_staff_shifts" ADD CONSTRAINT "dunda_staff_shifts_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."dunda_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_vip_packages" ADD CONSTRAINT "dunda_vip_packages_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_vip_packages" ADD CONSTRAINT "dunda_vip_packages_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_payments" ADD CONSTRAINT "dunda_payments_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_payments" ADD CONSTRAINT "dunda_payments_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_payments" ADD CONSTRAINT "dunda_payments_order_id_dunda_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."dunda_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_payments" ADD CONSTRAINT "dunda_payments_cashier_id_dunda_staff_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."dunda_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_refunds" ADD CONSTRAINT "dunda_refunds_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_refunds" ADD CONSTRAINT "dunda_refunds_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_refunds" ADD CONSTRAINT "dunda_refunds_payment_id_dunda_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."dunda_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_refunds" ADD CONSTRAINT "dunda_refunds_approved_by_id_dunda_staff_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."dunda_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_activity" ADD CONSTRAINT "dunda_activity_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_activity" ADD CONSTRAINT "dunda_activity_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_audit_logs" ADD CONSTRAINT "dunda_audit_logs_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_audit_logs" ADD CONSTRAINT "dunda_audit_logs_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_audit_logs" ADD CONSTRAINT "dunda_audit_logs_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."dunda_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_notifications" ADD CONSTRAINT "dunda_notifications_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_notifications" ADD CONSTRAINT "dunda_notifications_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_notifications" ADD CONSTRAINT "dunda_notifications_staff_id_dunda_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."dunda_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_subscriptions" ADD CONSTRAINT "dunda_subscriptions_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;