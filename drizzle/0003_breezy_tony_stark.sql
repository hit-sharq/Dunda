CREATE TABLE "dunda_order_ticket_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"order_item_id" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "dunda_order_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"order_id" text NOT NULL,
	"station" text NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dunda_categories" ADD COLUMN "station" text;--> statement-breakpoint
ALTER TABLE "dunda_order_ticket_items" ADD CONSTRAINT "dunda_order_ticket_items_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_order_ticket_items" ADD CONSTRAINT "dunda_order_ticket_items_ticket_id_dunda_order_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."dunda_order_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_order_ticket_items" ADD CONSTRAINT "dunda_order_ticket_items_order_item_id_dunda_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."dunda_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_order_tickets" ADD CONSTRAINT "dunda_order_tickets_organization_id_dunda_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."dunda_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_order_tickets" ADD CONSTRAINT "dunda_order_tickets_branch_id_dunda_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."dunda_branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_order_tickets" ADD CONSTRAINT "dunda_order_tickets_order_id_dunda_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."dunda_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Route existing categories to a station from their reporting group. A club can
-- override this per category, which is why station is nullable.
UPDATE "dunda_categories" SET "station" = 'KITCHEN' WHERE "group" = 'food' AND "station" IS NULL;
--> statement-breakpoint
UPDATE "dunda_categories" SET "station" = 'BAR' WHERE "group" IS DISTINCT FROM 'food' AND "station" IS NULL;
--> statement-breakpoint
-- Give existing orders a ticket so an in-progress shift is not stranded.
INSERT INTO "dunda_order_tickets" ("id", "organization_id", "branch_id", "order_id", "station", "number", "status", "created_at", "updated_at")
SELECT
  'ticket-legacy-' || o."id" || '-' || COALESCE(c."station", 'BAR'),
  o."organization_id", o."branch_id", o."id", COALESCE(c."station", 'BAR'),
  o."number" || '-' || CASE WHEN COALESCE(c."station", 'BAR') = 'BAR' THEN 'B' ELSE 'K' END,
  o."status",
  o."created_at", now()
FROM "dunda_orders" o
LEFT JOIN LATERAL (
  SELECT COALESCE(cat."station", 'BAR') AS station
  FROM "dunda_order_items" oi
  LEFT JOIN "dunda_categories" cat ON cat."id" = oi."category_id"
  WHERE oi."order_id" = o."id"
  LIMIT 1
) c ON true
WHERE o."id" NOT IN (SELECT "order_id" FROM "dunda_order_tickets");
--> statement-breakpoint
INSERT INTO "dunda_order_ticket_items" ("id", "organization_id", "ticket_id", "order_item_id", "name", "quantity", "notes")
SELECT
  'ticket-item-legacy-' || t."id" || '-' || oi."id",
  t."organization_id", t."id", oi."id", oi."name", oi."quantity", oi."notes"
FROM "dunda_order_tickets" t
JOIN "dunda_order_items" oi ON oi."order_id" = t."order_id"
LEFT JOIN "dunda_categories" cat ON cat."id" = oi."category_id"
WHERE COALESCE(cat."station", 'BAR') = t."station"
  AND NOT EXISTS (
    SELECT 1 FROM "dunda_order_ticket_items" x WHERE x."order_item_id" = oi."id"
  );
