import { and, eq, inArray } from "drizzle-orm";
import {
  orderTicketsTable,
  orderTicketItemsTable,
  tabsTable,
  type OrderTicket,
} from "@workspace/db";
import { loadCategoryStations, type Station } from "./routing";

/**
 * Keeps one open ticket per station for a tab.
 *
 * A table with a running tab has one document at the bar and one at the kitchen,
 * and lines are appended as the floor rings them in. That matches how a station
 * actually works — a single running ticket for the table — and means the boards
 * show one card rather than a new one per round.
 */
export async function raiseStationTicket(params: {
  tx: any;
  tenant: { organizationId: string; branchId: string | null };
  tab: typeof tabsTable.$inferSelect;
  product: { id: string; name: string; categoryId: string | null };
  lineId: string;
  quantity: number;
  notes: string | null;
}): Promise<{ station: Station; ticketId: string; created: boolean } | null> {
  const { tx, tenant, tab, product, lineId, quantity, notes } = params;
  if (!tab.tableId && !tab.branchId) return null;

  const stations = await loadCategoryStations(
    tenant.organizationId,
    product.categoryId ? [product.categoryId] : [],
  );
  const station = stations.get(product.categoryId ?? "") ?? "BAR";

  // Reuse this tab's open ticket for the station, if it already has one.
  const [existing] = await tx
    .select()
    .from(orderTicketsTable)
    .where(
      and(
        eq(orderTicketsTable.tabId, tab.id),
        eq(orderTicketsTable.station, station),
        inArray(orderTicketsTable.status, ["PENDING", "ACCEPTED", "PREPARING", "READY"]),
      ),
    );

  let ticketId = existing?.id;
  let created = false;

  if (!ticketId) {
    const [ticket] = await tx
      .insert(orderTicketsTable)
      .values({
        id: `ticket-${tab.id}-${station}-${Date.now()}`,
        organizationId: tenant.organizationId,
        branchId: tab.branchId,
        orderId: null,
        tabId: tab.id,
        station,
        number: `${tab.number}-${station === "BAR" ? "B" : "K"}`,
        status: "PENDING",
        notes: null,
      })
      .returning();
    ticketId = ticket.id;
    created = true;
  }

  // Appending the same product again bumps the line rather than duplicating it.
  const [sameLine] = await tx
    .select()
    .from(orderTicketItemsTable)
    .where(
      and(
        eq(orderTicketItemsTable.ticketId, ticketId),
        eq(orderTicketItemsTable.tabItemId, lineId),
      ),
    );

  if (sameLine) {
    await tx
      .update(orderTicketItemsTable)
      .set({ quantity: sameLine.quantity + quantity })
      .where(eq(orderTicketItemsTable.id, sameLine.id));
  } else {
    await tx.insert(orderTicketItemsTable).values({
      id: `ticket-item-${ticketId}-${lineId}`,
      organizationId: tenant.organizationId,
      ticketId,
      tabItemId: lineId,
      name: product.name,
      quantity,
      notes,
    });
  }

  return { station, ticketId, created };
}

/**
 * Closes whatever a tab still has in flight.
 *
 * Settling the bill means the table is done, so any ticket the bar or kitchen
 * has not already handed over is closed rather than left on the board.
 */
export async function closeTabTickets(
  tx: any,
  tabId: string,
  status = "SERVED",
): Promise<number> {
  const closed = await tx
    .update(orderTicketsTable)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(orderTicketsTable.tabId, tabId),
        inArray(orderTicketsTable.status, ["PENDING", "ACCEPTED", "PREPARING", "READY"]),
      ),
    )
    .returning({ id: orderTicketsTable.id });
  return closed.length;
}

/**
 * Open tickets for one tab, so the floor can see what a table still owes.
 */
export async function tabTickets(
  tx: any,
  tabId: string,
): Promise<Array<OrderTicket & { items: { name: string; quantity: number; notes: string | null }[] }>> {
  const tickets = await tx
    .select()
    .from(orderTicketsTable)
    .where(eq(orderTicketsTable.tabId, tabId));

  return Promise.all(
    tickets.map(async (ticket: OrderTicket) => {
      const items = await tx
        .select({
          name: orderTicketItemsTable.name,
          quantity: orderTicketItemsTable.quantity,
          notes: orderTicketItemsTable.notes,
        })
        .from(orderTicketItemsTable)
        .where(eq(orderTicketItemsTable.ticketId, ticket.id));
      return { ...ticket, items };
    }),
  );
}
