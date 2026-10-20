import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Tables a guest may order to at a branch. Public so the customer can pick
 * their own table from the QR page.
 */
export const GET = route(
  async (request: Request, context: { params: Promise<{ branchId: string }> }) => {
    const { branchId } = await context.params;

    const branch = await prisma.dunda_branches.findFirst({
      where: { id: branchId, status: { in: ["LIVE", "ACTIVE"] } },
      select: {
        id: true,
        name: true,
        dunda_organizations: { select: { id: true, status: true } },
      },
    });

    if (!branch) {
      return NextResponse.json(
        { error: "That location is not open right now.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (branch.dunda_organizations.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This club is not currently serving.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const tables = await prisma.dunda_tables.findMany({
      where: { branch_id: branch.id, status: { not: "CLOSED" } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        section: true,
        seats: true,
        tab_id: true,
      },
    });

    return NextResponse.json(
      tables.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        section: t.section,
        seats: t.seats,
        occupied: t.status === "OCCUPIED" || t.status === "PAYMENT_PENDING",
      })),
    );
  },
);
