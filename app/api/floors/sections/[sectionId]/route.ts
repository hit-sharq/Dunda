import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const updateSectionSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ sectionId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("manage_floor");
    const organizationId = session.organizationId as string;
    const { sectionId } = await context.params;

    const section = await prisma.dunda_floor_sections.findFirst({
      where: {
        id: sectionId,
        dunda_floors: { dunda_branches: { organization_id: organizationId } },
      },
      select: { id: true, name: true },
    });
    if (!section) throw notFound("That section");

    const input = await parseBody(updateSectionSchema, request);

    const updated = await prisma.dunda_floor_sections.update({
      where: { id: sectionId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      },
      select: { id: true, name: true, color: true, sort_order: true },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      color: updated.color,
      sortOrder: updated.sort_order,
    });
  },
);

export const DELETE = route(
  async (request: Request, context: { params: Promise<{ sectionId: string }> }) => {
    checkRateLimit(clientIpKey(request), 20, 60 * 60 * 1000);

    const session = await requirePermission("manage_floor");
    const organizationId = session.organizationId as string;
    const { sectionId } = await context.params;

    const section = await prisma.dunda_floor_sections.findFirst({
      where: {
        id: sectionId,
        dunda_floors: { dunda_branches: { organization_id: organizationId } },
      },
      select: { id: true, name: true },
    });
    if (!section) throw notFound("That section");

    // Tables point at a section by id rather than through a relation, so the
    // count is done here.
    const tableCount = await prisma.dunda_tables.count({
      where: { organization_id: organizationId, floor_section_id: sectionId },
    });

    if (tableCount > 0) {
      return NextResponse.json(
        {
          error: `Move the ${tableCount} table(s) off this section before removing it.`,
          code: "SECTION_IN_USE",
        },
        { status: 422 },
      );
    }

    await prisma.dunda_floor_sections.delete({ where: { id: sectionId } });

    return NextResponse.json({ id: sectionId, status: "DELETED" });
  },
);
