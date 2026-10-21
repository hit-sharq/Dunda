import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/** Lifts a block so the customer can pay again. */
export const DELETE = route(
  async (request: Request, context: { params: Promise<{ entryId: string }> }) => {
    const session = await requirePermission("manage_risk");
    const organizationId = session.organizationId as string;
    const { entryId } = await context.params;

    const entry = await prisma.dunda_card_blocklist.findFirst({
      where: {
        id: entryId,
        OR: [{ organization_id: null }, { organization_id: organizationId }],
      },
      select: { id: true, status: true, reason: true },
    });
    if (!entry) throw notFound("That blocklist entry");

    await prisma.dunda_card_blocklist.update({
      where: { id: entryId },
      data: { status: "LIFTED" },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: session.staffId,
        action: "REMOVE",
        entity: "card_blocklist",
        entity_id: entryId,
        detail: `Lifted the block on ${entryId}`,
        previous_value: { status: entry.status, reason: entry.reason },
        new_value: { status: "LIFTED" },
      },
    });

    return NextResponse.json({ id: entryId, status: "LIFTED" });
  },
);
