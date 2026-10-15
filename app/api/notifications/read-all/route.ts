import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { route, requireSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";


export const POST = route(async () => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const where: Prisma.dunda_notificationsWhereInput = {
    organization_id: organizationId,
    read: { not: "true" },
    OR: [{ staff_id: { equals: null } }, { staff_id: session.staffId }],
  };

  const result = await prisma.dunda_notifications.updateMany({
    where,
    data: { read: "true", read_at: new Date() },
  });

  return NextResponse.json({ marked: result.count, count: 0 });
});