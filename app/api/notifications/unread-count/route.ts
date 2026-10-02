import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { route, requireSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * How many notifications this person has not read.
 *
 * A count rather than the list: the badge is on screen all night and must not
 * drag every message with it on each poll. Scoped the same way the list is, so
 * the badge and the bell can never disagree about what is unread.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const where: Prisma.dunda_notificationsWhereInput = {
    organization_id: organizationId,
    ...(branchId ? { branch_id: branchId } : {}),
    read: { not: "true" },
    OR: [{ staff_id: { equals: null } }, { staff_id: session.staffId }],
  };

  const count = await prisma.dunda_notifications.count({ where });

  return NextResponse.json({ count });
});
