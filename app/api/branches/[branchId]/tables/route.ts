import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/** The tables at one branch, with the tab and customer on each. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ branchId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { branchId } = await context.params;

    const branch = await prisma.dunda_branches.findFirst({
      where: orgWhere(organizationId, { id: branchId }),
      select: { id: true, name: true },
    });
    if (!branch) throw notFound("That branch");

    const tables = await prisma.dunda_tables.findMany({
      where: { branch_id: branch.id },
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
  },
);
