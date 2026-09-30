import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  categoriesTable,
  orderTicketsTable,
} from "@workspace/db";

export type Station = "BAR" | "KITCHEN";

/**
 * Which station prepares an item.
 *
 * A category may name its station explicitly, because a club can just as
 * reasonably serve desserts from the bar as from the kitchen. Otherwise routing
 * falls back to the reporting group, and finally to the bar.
 */
export function stationFor(
  category: { station: string | null; group: string | null } | undefined,
): Station {
  if (category?.station === "BAR" || category?.station === "KITCHEN") {
    return category.station;
  }
  if (category?.group === "food") return "KITCHEN";
  return "BAR";
}

export interface TicketLine {
  orderItemId: string;
  name: string;
  quantity: number;
  notes: string | null;
  station: Station;
}

/**
 * Splits order lines into one ticket per station.
 *
 * The bar and the kitchen work from the same order but need to advance
 * independently: a round of drinks being served must not clear the food from
 * the pass.
 */
export function splitIntoTickets(lines: TicketLine[]): Map<Station, TicketLine[]> {
  const grouped = new Map<Station, TicketLine[]>();
  for (const line of lines) {
    const bucket = grouped.get(line.station) ?? [];
    bucket.push(line);
    grouped.set(line.station, bucket);
  }
  return grouped;
}

/** Loads the station for every category in one query. */
export async function loadCategoryStations(
  organizationId: string,
  categoryIds: string[],
): Promise<Map<string, Station>> {
  const result = new Map<string, Station>();
  if (!categoryIds.length) return result;

  const rows = await db
    .select({
      id: categoriesTable.id,
      station: categoriesTable.station,
      group: categoriesTable.group,
    })
    .from(categoriesTable)
    .where(
      and(
        eq(categoriesTable.organizationId, organizationId),
        inArray(categoriesTable.id, categoryIds),
      ),
    );

  for (const row of rows) result.set(row.id, stationFor(row));
  return result;
}

/**
 * A ticket is finished once it has been served, completed or cancelled.
 */
export const CLOSED_TICKET_STATUSES = ["SERVED", "COMPLETED", "CANCELLED"] as const;

export function isClosed(status: string): boolean {
  return (CLOSED_TICKET_STATUSES as readonly string[]).includes(status);
}

