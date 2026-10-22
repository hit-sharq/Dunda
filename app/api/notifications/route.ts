import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

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
const createNotificationSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1, "Give the notification a title."),
  message: z.string().min(1, "Say what happened."),
  staffId: z.string().min(1, "Who is this for?"),
  branchId: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
});

/**
 * Raises a notification for one staff member. This is how the bar tells the
 * kitchen a table needs something, or the floor tells a manager a tab is
 * waiting.
 */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

  const session = await requirePermission("manage_staff");
  const organizationId = session.organizationId as string;

  const input = await parseBody(createNotificationSchema, request);

  const staff = await prisma.dunda_staff.findFirst({
    where: orgWhere(organizationId, { id: input.staffId }),
    select: { id: true, name: true, branch_id: true },
  });
  if (!staff) {
    return NextResponse.json(
      { error: "That person is not on this club's roster.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const created = await prisma.dunda_notifications.create({
    data: {
      organization_id: organizationId,
      branch_id: input.branchId ?? staff.branch_id,
      staff_id: staff.id,
      type: input.type,
      title: input.title,
      message: input.message,
      read: "false",
      reference_id: input.referenceId ?? null,
    },
    select: { id: true, type: true, title: true, message: true, reference_id: true, created_at: true },
  });

  return NextResponse.json(
    {
      id: created.id,
      type: created.type,
      title: created.title,
      message: created.message,
      referenceId: created.reference_id,
      createdAt: created.created_at.toISOString(),
    },
    { status: 201 },
  );
});
