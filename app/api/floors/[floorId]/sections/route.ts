import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const createSectionSchema = z.object({
  floorId: z.string().min(1),
  name: z.string().min(1, "Give the section a name."),
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

/** A section is a zone on a floor: the patio, the rail, the back corner. */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

  const session = await requirePermission("manage_floor");
  const organizationId = session.organizationId as string;

  const input = await parseBody(createSectionSchema, request);

  const floor = await prisma.dunda_floors.findFirst({
    where: { id: input.floorId, dunda_branches: { organization_id: organizationId } },
    select: { id: true, name: true, branch_id: true },
  });
  if (!floor) throw notFound("That floor");

  const created = await prisma.dunda_floor_sections.create({
    data: {
      floor_id: floor.id,
      name: input.name,
      color: input.color ?? "#f07a4b",
      sort_order: input.sortOrder ?? 0,
    },
    select: { id: true, name: true, color: true, sort_order: true },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: floor.branch_id,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "floor_section",
      entity_id: created.id,
      detail: `Section ${created.name} added to ${floor.name}`,
      new_value: { name: created.name },
    },
  });

  return NextResponse.json(
    {
      id: created.id,
      name: created.name,
      color: created.color,
      sortOrder: created.sort_order,
    },
    { status: 201 },
  );
});
