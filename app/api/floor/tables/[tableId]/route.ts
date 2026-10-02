import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere, assertSameOrg } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const STATUSES = ["AVAILABLE", "OCCUPIED", "RESERVED", "PAYMENT_PENDING", "CLEANING"];

/** Frees a table once its bill is settled, or parks it while it is tidied. */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ tableId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;

    const { tableId } = await context.params;
    const body = (await request.json()) as { status?: string };

    if (!body.status || !STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `A table can be ${STATUSES.join(", ")}.`, code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    const table = await prisma.dunda_tables.findFirst({
      where: orgWhere(organizationId, { id: tableId }),
    });
    assertSameOrg(table, organizationId, "That table");

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.dunda_tables.update({
        where: { id: tableId },
        data: {
          status: body.status as string,
          // Freeing a table clears who was sitting there. Leaving the old party
          // attached would put the next guest's tab on their name.
          ...(body.status === "AVAILABLE" ? { tab_id: null, customer: null, total: 0 } : {}),
        },
      });

      await tx.dunda_audit_logs.create({
        data: {
          organization_id: organizationId,
          branch_id: row.branch_id,
          staff_id: session.staffId,
          action: "UPDATE",
          entity: "table",
          entity_id: tableId,
          detail: `${row.name} set to ${body.status}`,
          previous_value: { status: table?.status },
          new_value: { status: body.status },
        },
      });

      return row;
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      status: updated.status,
      tabId: updated.tab_id,
      total: updated.total,
    });
  },
);
