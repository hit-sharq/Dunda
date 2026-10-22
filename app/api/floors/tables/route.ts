import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const createTableSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1, "Give the table a name."),
  section: z.string().min(1, "Which section is it in?"),
  floorId: z.string().nullable().optional(),
  floorSectionId: z.string().nullable().optional(),
  seats: z.number().int().min(1).optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const tables = await prisma.dunda_tables.findMany({
    where: orgWhere(organizationId, { branch_id: branchId ?? undefined }),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      section: true,
      seats: true,
      status: true,
      x: true,
      y: true,
      width: true,
      height: true,
      floor_id: true,
      floor_section_id: true,
      tab_id: true,
      customer: true,
    },
  });

  return NextResponse.json(
    tables.map((t) => ({
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
    })),
  );
});

export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

  const session = await requirePermission("manage_floor");
  const organizationId = session.organizationId as string;

  const input = await parseBody(createTableSchema, request);

  const branch = await prisma.dunda_branches.findFirst({
    where: orgWhere(organizationId, { id: input.branchId }),
    select: { id: true, name: true },
  });
  if (!branch) throw notFound("That branch");

  const created = await prisma.dunda_tables.create({
    data: {
      organization_id: organizationId,
      branch_id: branch.id,
      name: input.name,
      section: input.section,
      floor_id: input.floorId ?? null,
      floor_section_id: input.floorSectionId ?? null,
      seats: input.seats ?? 4,
      status: "AVAILABLE",
      x: input.x ?? 0,
      y: input.y ?? 0,
      width: input.width ?? 120,
      height: input.height ?? 120,
    },
    select: {
      id: true,
      name: true,
      section: true,
      seats: true,
      status: true,
      x: true,
      y: true,
      width: true,
      height: true,
      floor_id: true,
      floor_section_id: true,
      tab_id: true,
      customer: true,
    },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: branch.id,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "table",
      entity_id: created.id,
      detail: `Table ${created.name} added to ${branch.name}`,
      new_value: { name: created.name, section: created.section },
    },
  });

  return NextResponse.json(
    {
      id: created.id,
      name: created.name,
      section: created.section,
      seats: created.seats,
      status: created.status,
      x: created.x,
      y: created.y,
      width: created.width,
      height: created.height,
      floorId: created.floor_id,
      floorSectionId: created.floor_section_id,
      tabId: created.tab_id,
      customer: created.customer,
    },
    { status: 201 },
  );
});
