import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  orderItemsTable,
  orderTicketsTable,
  orderTicketItemsTable,
  ordersTable,
  tablesTable,
  tabItemsTable,
  tabsTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import { InvalidTransitionError, ORDER_STATUS_TRANSITIONS } from "../lib/orderWorkflow";
import { isClosed } from "../lib/routing";
import { tabTickets } from "../lib/tabTickets";
import type { StaffContext } from "../lib/permissions";
import { publish } from "../lib/realtime";
import {
  deductInventoryForOrderItem as deductForItem,
  deductInventoryForTabItem as deductForTabItem,
} from "../lib/inventory";

const router: IRouter = Router();

const STATIONS = ["BAR", "KITCHEN"] as const;

function can(req: any, permission: string): boolean {
  const ctx: StaffContext | undefined = req.clerk?.__staffContext;
  if (!ctx) return false;
  return ctx.isOwner || ctx.permissions.has(permission);
}

function deny(res: any, permission: string): void {
  res.status(403).json({
    error: `You do not have permission to perform this action. Required: ${permission}`,
  });
}

/**
 * Station tickets.
 *
 * A table ordering both drinks and food produces one ticket for the bar and
 * one for the kitchen under a single order. They share the bill, but each
 * station only ever sees its own lines and moves them through its own
 * workflow, so serving the first round does not clear the food from the pass.
 */
router.get("/", async (req, res): Promise<void> => {
  if (!can(req, "view_pos")) return deny(res, "view_pos");
  const tenant = getTenant(req);

  const station = String(req.query.station ?? "").toUpperCase();
  if (!STATIONS.includes(station as (typeof STATIONS)[number])) {
    res.status(400).json({ error: "A station of BAR or KITCHEN is required." });
    return;
  }

  const includeClosed = req.query.includeClosed === "true";

  const rows = await db
    .select({ ticket: orderTicketsTable, order: ordersTable })
    .from(orderTicketsTable)
    .innerJoin(ordersTable, eq(orderTicketsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(orderTicketsTable.organizationId, tenant.organizationId),
        eq(orderTicketsTable.station, station),
        tenant.branchId ? eq(orderTicketsTable.branchId, tenant.branchId) : undefined,
        includeClosed
          ? undefined
          : inArray(orderTicketsTable.status, [
              "PENDING",
              "ACCEPTED",
              "PREPARING",
              "READY",
            ]),
      ),
    )
    .orderBy(asc(orderTicketsTable.createdAt));

  const result = await Promise.all(
    rows.map(async ({ ticket, order }) => {
      const items = await db
        .select()
        .from(orderTicketItemsTable)
        .where(eq(orderTicketItemsTable.ticketId, ticket.id));
      return {
        id: ticket.id,
        number: ticket.number,
        orderId: ticket.orderId,
        orderNumber: order.number,
        table: order.tableName,
        tableId: order.tableId,
        station: ticket.station,
        status: ticket.status,
        notes: ticket.notes,
        createdAt: ticket.createdAt,
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          notes: i.notes,
        })),
      };
    }),
  );

  res.json(result);
});

/**
 * The tickets raised from one tab.
 *
 * This is what the floor asks for: what has this table already rung in, and
 * which stations still owe them something.
 */
router.get("/by-tab/:tabId", async (req, res): Promise<void> => {
  if (!can(req, "view_pos")) return deny(res, "view_pos");
  const tenant = getTenant(req);

  const rows = await tabTickets(db, req.params.tabId);
  res.json(
    rows
      .filter((t) => t.organizationId === tenant.organizationId)
      .map((t) => ({
        id: t.id,
        number: t.number,
        tabId: t.tabId,
        station: t.station,
        status: t.status,
        createdAt: t.createdAt,
        items: t.items.map((i) => ({
          id: i.name,
          name: i.name,
          quantity: i.quantity,
          notes: i.notes,
        })),
      })),
  );
});

/** The tickets attached to one order, so the POS can show what is outstanding. */
router.get("/by-order/:orderId", async (req, res): Promise<void> => {
  if (!can(req, "view_pos")) return deny(res, "view_pos");
  const tenant = getTenant(req);

  const rows = await db
    .select()
    .from(orderTicketsTable)
    .where(
      and(
        eq(orderTicketsTable.orderId, req.params.orderId),
        eq(orderTicketsTable.organizationId, tenant.organizationId),
      ),
    );

  const result = await Promise.all(
    rows.map(async (ticket) => ({
      ...ticket,
      items: await db
        .select()
        .from(orderTicketItemsTable)
        .where(eq(orderTicketItemsTable.ticketId, ticket.id)),
    })),
  );
  res.json(result);
});

/**
 * Advances one station ticket.
 *
 * Stock is deducted when the ticket is served, not when the order completes, so
 * a ticket abandoned mid-service never deducts anything and each station is
 * accountable for what it actually handed over.
 */
router.patch("/:ticketId", async (req, res): Promise<void> => {
  if (!can(req, "update_ticket")) return deny(res, "update_ticket");
  const tenant = getTenant(req);
  const ctx = req.clerk?.__staffContext as StaffContext | undefined;

  const parsed = z
    .object({
      status: z.enum(["ACCEPTED", "PREPARING", "READY", "SERVED", "CANCELLED"]),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  type AdvanceResult =
    | { kind: "ok"; ticket: typeof orderTicketsTable.$inferSelect }
    | { kind: "conflict"; message: string }
    | { kind: "missing" };

  const outcome = await db.transaction<AdvanceResult>(async (tx) => {
    const [ticket] = await tx
      .select()
      .from(orderTicketsTable)
      .where(
        and(
          eq(orderTicketsTable.id, req.params.ticketId),
          eq(orderTicketsTable.organizationId, tenant.organizationId),
        ),
      );
    if (!ticket) return { kind: "missing" } as const;

    if (ticket.status !== parsed.data.status) {
      const allowed = ORDER_STATUS_TRANSITIONS[ticket.status];
      if (allowed && !allowed.includes(parsed.data.status)) {
        return {
          kind: "conflict",
          message: `A ticket cannot move from ${ticket.status} to ${parsed.data.status}`,
        } as const;
      }
    }

    // A ticket hangs off an order or off a tab. Either way it needs the order
    // row for billing context and the table, so resolve the tab when there is
    // no order.
    let order = ticket.orderId
      ? (
          await tx
            .select()
            .from(ordersTable)
            .where(eq(ordersTable.id, ticket.orderId))
        )[0]
      : undefined;

    if (!order && ticket.tabId) {
      const [tab] = await tx
        .select()
        .from(tabsTable)
        .where(eq(tabsTable.id, ticket.tabId));
      if (tab) {
        order = {
          id: tab.id,
          organizationId: tab.organizationId,
          branchId: tab.branchId,
          number: tab.number,
          tableName: tab.tableName,
          tableId: tab.tableId,
          customerId: null,
          staffId: null,
          status: tab.status,
          subtotal: tab.subtotal,
          serviceCharge: tab.serviceCharge,
          tax: tab.tax,
          discount: tab.discount,
          total: tab.total,
          notes: null,
          createdAt: tab.openedAt,
          updatedAt: tab.openedAt,
        };
      }
    }
    if (!order) return { kind: "missing" } as const;

    const lines = await tx
      .select()
      .from(orderTicketItemsTable)
      .where(eq(orderTicketItemsTable.ticketId, ticket.id));

    // A cancelled ticket gives nothing back, so a line served by mistake is a
    // manager decision rather than an automatic stock change.
    if (parsed.data.status === "SERVED" && ticket.status !== "SERVED") {
      for (const line of lines) {
        // A ticket raised from a POS tab has no order_items row, so the
        // deduction is driven by the ticket line's own recorded quantity.
        if (line.orderItemId) {
          const [item] = await tx
            .select()
            .from(orderItemsTable)
            .where(eq(orderItemsTable.id, line.orderItemId));
          if (item) await deductForItem(tx, order, item, ctx ?? null);
        } else if (line.tabItemId) {
          const [tabItem] = await tx
            .select()
            .from(tabItemsTable)
            .where(eq(tabItemsTable.id, line.tabItemId));
          if (tabItem) await deductForTabItem(tx, order, tabItem, ctx ?? null);
        }
      }
    }

    const [updated] = await tx
      .update(orderTicketsTable)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(orderTicketsTable.id, ticket.id))
      .returning();

    // The seats are free once no ticket is still being worked, even if the
    // order itself is still open for payment.
    const remaining = await tx
      .select({ status: orderTicketsTable.status })
      .from(orderTicketsTable)
      .where(
        ticket.orderId
          ? eq(orderTicketsTable.orderId, ticket.orderId)
          : eq(orderTicketsTable.tabId, ticket.tabId ?? ""),
      );
    if (remaining.every((t) => isClosed(t.status)) && order.tableId) {
      await tx
        .update(tablesTable)
        .set({ status: "AVAILABLE", tabId: null, customer: null, total: 0 })
        .where(
          and(
            eq(tablesTable.id, order.tableId),
            eq(tablesTable.organizationId, tenant.organizationId),
          ),
        );
    }

    return { kind: "ok", ticket: updated } as const;
  });

  if (outcome.kind === "conflict") {
    res.status(409).json({ error: outcome.message, code: "INVALID_STATUS_TRANSITION" });
    return;
  }
  if (outcome.kind === "missing") {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  publish({
    topic: "ORDER_STATUS_CHANGED",
    organizationId: outcome.ticket.organizationId,
    branchId: outcome.ticket.branchId,
    entityId: outcome.ticket.orderId,
  });

  const items = await db
    .select()
    .from(orderTicketItemsTable)
    .where(eq(orderTicketItemsTable.ticketId, outcome.ticket.id));

  res.json({
    ...outcome.ticket,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      notes: i.notes,
    })),
  });
});

export default router;
