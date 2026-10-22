import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const updateFloorSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ floorId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("manage_floor");
    const organizationId = session.organizationId as string;
    const { floorId } = await context.params;

    const floor = await prisma.dunda_floors.findFirst({
      where: { id: floorId, dunda_branches: { organization_id: organizationId } },
      select: { id: true, name: true },
    });
    if (!floor) throw notFound("That floor");

    const input = await parseBody(updateFloorSchema, request);

    const updated = await prisma.dunda_floors.update({
      where: { id: floorId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      },
      select: { id: true, name: true, sort_order: true },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      sortOrder: updated.sort_order,
    });
  },
);

export const DELETE = route(
  async (request: Request, context: { params: Promise<{ floorId: string }> }) => {
    checkRateLimit(clientIpKey(request), 20, 60 * 60 * 1000);

    const session = await requirePermission("manage_floor");
    const organizationId = session.organizationId as string;
    const { floorId } = await context.params;

    const floor = await prisma.dunda_floors.findFirst({
      where: { id: floorId, dunda_branches: { organization_id: organizationId } },
      select: { id: true, name: true, branch_id: true, _count: { select: { dunda_tables: true } } },
    });
    if (!floor) throw notFound("That floor");

    if (floor._count.dunda_tables > 0) {
      return NextResponse.json(
        {
          error: `Move the ${floor._count.dunda_tables} table(s) off this floor before removing it.`,
          code: "FLOOR_IN_USE",
        },
        { status: 422 },
      );
    }

    await prisma.dunda_floors.delete({ where: { id: floorId } });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: floor.branch_id,
        staff_id: session.staffId,
        action: "DELETE",
        entity: "floor",
        entity_id: floorId,
        detail: `Floor ${floor.name} removed`,
        previous_value: { name: floor.name },
      },
    });

    return NextResponse.json({ id: floorId, status: "DELETED" });
  },
);
