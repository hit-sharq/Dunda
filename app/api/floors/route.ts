import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const createFloorSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1, "Give the floor a name."),
  sortOrder: z.number().int().optional(),
});

/** The layout of the branch: floors, the sections on them, and the tables. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const floors = await prisma.dunda_floors.findMany({
    where: { dunda_branches: { organization_id: organizationId } },
    orderBy: { sort_order: "asc" },
    include: {
      dunda_floor_sections: {
        orderBy: { sort_order: "asc" },
        select: { id: true, name: true, color: true, sort_order: true },
      },
    },
  });

  // Only the floors belonging to the branch being looked at.
  const forBranch = branchId
    ? floors.filter((f) => f.branch_id === branchId)
    : floors;

  return NextResponse.json({
    branchId: branchId ?? null,
    floors: forBranch.map((f) => ({
      id: f.id,
      name: f.name,
      sortOrder: f.sort_order,
      sections: f.dunda_floor_sections.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        sortOrder: s.sort_order,
      })),
    })),
  });
});

export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

  const session = await requirePermission("manage_floor");
  const organizationId = session.organizationId as string;

  const input = await parseBody(createFloorSchema, request);

  const branch = await prisma.dunda_branches.findFirst({
    where: orgWhere(organizationId, { id: input.branchId }),
    select: { id: true, name: true },
  });
  if (!branch) throw notFound("That branch");

  const created = await prisma.dunda_floors.create({
    data: {
      branch_id: branch.id,
      name: input.name,
      sort_order: input.sortOrder ?? 0,
    },
    select: { id: true, name: true, sort_order: true },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: branch.id,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "floor",
      entity_id: created.id,
      detail: `Floor ${created.name} added to ${branch.name}`,
      new_value: { name: created.name },
    },
  });

  return NextResponse.json(
    { id: created.id, name: created.name, sortOrder: created.sort_order, sections: [] },
    { status: 201 },
  );
});
