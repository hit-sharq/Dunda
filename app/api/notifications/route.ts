import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Notifications for this person on this shift.
 *
 * Scoped to the staff row rather than the whole club: a bartender does not need to
 * see the owner's stock warnings. A notification with no staff row is a club-wide
 * notice — low stock, a failed payment — and everybody on shift sees it.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const where: Prisma.dunda_notificationsWhereInput = {
    organization_id: organizationId,
    ...(branchId ? { branch_id: branchId } : {}),
    // Null has to be written as a filter equality rather than as a bare null,
    // which would mean "any value" rather than "no value".
    OR: [{ staff_id: { equals: null } }, { staff_id: session.staffId }],
  };

  const notifications = await prisma.dunda_notifications.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: 60,
  });

  return NextResponse.json(
    notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read === "true",
      referenceId: n.reference_id,
      createdAt: n.created_at.toISOString(),
      readAt: n.read_at?.toISOString() ?? null,
    })),
  );
});

/** Marks everything read, so the bell can be cleared in one press. */
export const DELETE = route(async () => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const result = await prisma.dunda_notifications.updateMany({
    where: {
      organization_id: organizationId,
      OR: [{ staff_id: { equals: null } }, { staff_id: session.staffId }],
      read: { not: "true" },
    },
    data: { read: "true", read_at: new Date() },
  });

  return NextResponse.json({ marked: result.count });
});
