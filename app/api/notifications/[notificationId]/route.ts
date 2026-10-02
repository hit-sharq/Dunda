import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Marks one notification read.
 *
 * A notification addressed to somebody else is refused rather than quietly marked:
 * reading someone else's message and then dismissing it is how a club misses the
 * one that mattered.
 */
export const PATCH = route(
  async (_request: Request, context: { params: Promise<{ notificationId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { notificationId } = await context.params;

    const notification = await prisma.dunda_notifications.findFirst({
      where: orgWhere(organizationId, { id: notificationId }),
      select: { id: true, staff_id: true },
    });
    if (!notification) {
      return NextResponse.json(
        { error: "That notification no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    if (notification.staff_id && notification.staff_id !== session.staffId) {
      return NextResponse.json(
        { error: "That notification belongs to somebody else.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const updated = await prisma.dunda_notifications.update({
      where: { id: notificationId },
      data: { read: "true", read_at: new Date() },
    });

    return NextResponse.json({
      id: updated.id,
      read: true,
      readAt: updated.read_at?.toISOString() ?? null,
    });
  },
);
