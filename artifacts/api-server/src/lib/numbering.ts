import { sql } from "drizzle-orm";
import { documentCountersTable } from "@workspace/db";

/**
 * Allocates the next number for a document kind within a branch.
 *
 * Tab and order numbers are printed on receipts, called across the floor and
 * stored in the audit log, so they must be unique and increasing. These were
 * previously generated as a random offset from a fixed number, which produced
 * duplicates within a single shift and wrapped every few minutes.
 *
 * The upsert takes a row lock, so concurrent checkouts cannot be handed the
 * same value.
 */
export async function nextDocumentNumber(
  tx: any,
  organizationId: string,
  branchId: string,
  kind: string,
  prefix: string,
  width = 4,
): Promise<string> {
  const id = `${organizationId}:${branchId}:${kind}`;

  await tx
    .insert(documentCountersTable)
    .values({ id, organizationId, branchId, kind, nextValue: 1 })
    .onConflictDoNothing();

  const [row] = await tx
    .update(documentCountersTable)
    .set({
      nextValue: sql`${documentCountersTable.nextValue} + 1`,
      updatedAt: new Date(),
    })
    .where(
      sql`${documentCountersTable.id} = ${id} and ${documentCountersTable.nextValue} = (
        select next_value from dunda_document_counters where id = ${id}
      )`,
    )
    .returning({ value: documentCountersTable.nextValue });

  // A concurrent writer took this value first; read the current head instead.
  const allocated = row
    ? row.value - 1
    : await currentValue(tx, id);

  return `${prefix}${String(allocated).padStart(width, "0")}`;
}

async function currentValue(tx: any, id: string): Promise<number> {
  const [row] = await tx
    .select({ value: documentCountersTable.nextValue })
    .from(documentCountersTable)
    .where(sql`${documentCountersTable.id} = ${id}`);
  return row?.value ?? 1;
}
