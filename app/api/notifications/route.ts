import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";


export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const where: Prisma.dunda_notificationsWhereInput = {
    organization_id: organizationId,
    ...(branchId ? { branch_id: branchId } : {}),
    
    
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