import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requirePermission, requireModule, orgWhere } from "@/lib/server/http";
import { createEventSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

/** What is on, with tickets sold and guests checked in. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  await requireModule(organizationId, "events");
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const events = await prisma.dunda_events.findMany({
    where: orgWhere(organizationId, branchId ? { branch_id: branchId } : undefined),
    orderBy: { date: "asc" },
    take: 100,
    include: {
      _count: { select: { dunda_event_tickets: true, dunda_event_guest_list: true } },
      dunda_event_tickets: {
        select: { id: true, status: true, amount: true, checked_in_at: true },
      },
    },
  });

  return NextResponse.json(
    events.map((event) => {
      const sold = event.dunda_event_tickets.filter((t) => t.status !== "CANCELLED");
      const checkedIn = sold.filter((t) => t.checked_in_at !== null);
      return {
        id: event.id,
        name: event.name,
        description: event.description,
        date: event.date,
        startTime: event.start_time,
        endTime: event.end_time,
        startsAt: `${event.date}T${event.start_time}`,
        endsAt: `${event.date}T${event.end_time}`,
        capacity: event.capacity,
        status: event.status,
        ticketsSold: sold.length,
        ticketsCheckedIn: checkedIn.length,
        guestList: event._count.dunda_event_guest_list,
        revenue: sold.reduce((sum, t) => sum + t.amount, 0),
      };
    }),
  );
});

export const POST = route(async (request: Request) => {
  const session = await requirePermission("manage_events");
  const organizationId = session.organizationId as string;
  await requireModule(organizationId, "events");

  const body = await request.json().catch(() => ({}));
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue ? `${issue.path.join(".") || "event"}: ${issue.message}` : "Invalid event.",
        code: "VALIDATION_FAILED",
      },
      { status: 422 },
    );
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (endsAt <= startsAt) {
    return NextResponse.json(
      { error: "An event has to end after it starts.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const branch = await prisma.dunda_branches.findFirst({
    where: orgWhere(organizationId, { id: parsed.data.branchId }),
    select: { id: true },
  });
  if (!branch) {
    return NextResponse.json(
      { error: "That branch is not part of this club.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const event = await prisma.dunda_events.create({
    data: {
      organization_id: organizationId,
      branch_id: branch.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      date: startsAt.toISOString().slice(0, 10),
      start_time: startsAt.toTimeString().slice(0, 5),
      end_time: endsAt.toTimeString().slice(0, 5),
      capacity: parsed.data.capacity,
      status: "UPCOMING",
    },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: branch.id,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "event",
      entity_id: event.id,
      detail: `${event.name} on ${event.date} at ${event.start_time}`,
    },
  });

  return NextResponse.json(
    { id: event.id, name: event.name, date: event.date, status: event.status },
    { status: 201 },
  );
});
