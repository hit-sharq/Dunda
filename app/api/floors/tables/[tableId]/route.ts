import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const updateTableSchema = z.object({
  name: z.string().min(1).optional(),
  section: z.string().min(1).optional(),
  floorId: z.string().nullable().optional(),
  floorSectionId: z.string().nullable().optional(),
  seats: z.number().int().min(1).optional(),
  status: z.string().optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

function tableShape(t: any) {
  return {
    id: t.id,
    name: t.name,
    section: t.section,
    seats: t.seats,
    status: t.status,
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    floorId: t.floor_id,
    floorSectionId: t.floor_section_id,
    tabId: t.tab_id,
    customer: t.customer,
  };
}

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ tableId: string }> }) => {
    checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

    const session = await requirePermission("manage_floor");
    const organizationId = session.organizationId as string;
    const { tableId } = await context.params;

    const table = await prisma.dunda_tables.findFirst({
      where: orgWhere(organizationId, { id: tableId }),
      select: { id: true, name: true },
    });
    if (!table) throw notFound("That table");

    const input = await parseBody(updateTableSchema, request);

    const updated = await prisma.dunda_tables.update({
      where: { id: tableId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.section !== undefined ? { section: input.section } : {}),
        ...(input.floorId !== undefined ? { floor_id: input.floorId } : {}),
        ...(input.floorSectionId !== undefined
          ? { floor_section_id: input.floorSectionId }
          : {}),
        ...(input.seats !== undefined ? { seats: input.seats } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.x !== undefined ? { x: input.x } : {}),
        ...(input.y !== undefined ? { y: input.y } : {}),
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
      },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: updated.branch_id,
        staff_id: session.staffId,
        action: "UPDATE",
        entity: "table",
        entity_id: tableId,
        detail: `Table ${updated.name} updated`,
        previous_value: { name: table.name },
        new_value: { name: updated.name, section: updated.section },
      },
    });

    return NextResponse.json(tableShape(updated));
  },
);

export const DELETE = route(
  async (request: Request, context: { params: Promise<{ tableId: string }> }) => {
    checkRateLimit(clientIpKey(request), 20, 60 * 60 * 1000);

    const session = await requirePermission("manage_floor");
    const organizationId = session.organizationId as string;
    const { tableId } = await context.params;

    const table = await prisma.dunda_tables.findFirst({
      where: orgWhere(organizationId, { id: tableId }),
      select: { id: true, name: true, tab_id: true, branch_id: true },
    });
    if (!table) throw notFound("That table");

    if (table.tab_id) {
      return NextResponse.json(
        {
          error: "Close the tab on this table before removing the table.",
          code: "TABLE_IN_USE",
        },
        { status: 422 },
      );
    }

    await prisma.dunda_tables.delete({ where: { id: tableId } });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: table.branch_id,
        staff_id: session.staffId,
        action: "DELETE",
        entity: "table",
        entity_id: tableId,
        detail: `Table ${table.name} removed`,
        previous_value: { name: table.name },
      },
    });

    return NextResponse.json({ id: tableId, status: "DELETED" });
  },
);
