ALTER TABLE "dunda_tabs" ADD COLUMN "table_id" text;--> statement-breakpoint
ALTER TABLE "dunda_orders" ADD COLUMN "table_id" text;--> statement-breakpoint
ALTER TABLE "dunda_tabs" ADD CONSTRAINT "dunda_tabs_table_id_dunda_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dunda_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunda_orders" ADD CONSTRAINT "dunda_orders_table_id_dunda_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dunda_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Link existing rows to their table. The old link was a display name, so this
-- resolves it once and then the foreign key keeps it correct.
UPDATE "dunda_tabs" t
SET "table_id" = tbl."id"
FROM "dunda_tables" tbl
WHERE t."table_id" IS NULL
  AND t."table_name" = tbl."name"
  AND t."branch_id" = tbl."branch_id"
  AND tbl."tab_id" = t."id";
--> statement-breakpoint
UPDATE "dunda_orders" o
SET "table_id" = tbl."id"
FROM "dunda_tables" tbl
WHERE o."table_id" IS NULL
  AND o."table_name" = tbl."name"
  AND o."branch_id" = tbl."branch_id";
