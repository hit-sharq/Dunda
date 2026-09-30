ALTER TABLE "dunda_order_tickets" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dunda_order_tickets" ADD COLUMN "tab_id" text;--> statement-breakpoint
ALTER TABLE "dunda_order_tickets" ADD CONSTRAINT "dunda_order_tickets_tab_id_dunda_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."dunda_tabs"("id") ON DELETE cascade ON UPDATE no action;