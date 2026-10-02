import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requirePermission, orgWhere, assertSameOrg } from "@/lib/server/http";
import { createReservationSchema } from "@/lib/server/schemas";
import { conflict } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/** Bookings, soonest first. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const date = url.searchParams.get("date");

  const reservations = await prisma.dunda_reservations.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      ...(date ? { reservation_date: date } : {}),
    }),
    orderBy: { starts_at: "asc" },
    take: 200,
  });

  return NextResponse.json(
    reservations.map((r) => ({
      id: r.id,
      customer: r.customer,
      phone: r.phone,
      date: r.reservation_date,
      time: r.time,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      table: r.table_name,
      tableId: r.table_id,
      poolTableId: r.pool_table_id,
      guests: r.guests,
      status: r.status,
      notes: r.notes,
    })),
  );
});

/**
 * Books a table or a pool table.
 *
 * Overlaps are refused here rather than caught later: two parties arriving for the
 * same table at eight o'clock is the failure this screen exists to prevent.
 */
export const POST = route(async (request: Request) => {
  const session = await requirePermission("manage_reservations");
  const organizationId = session.organizationId as string;

  const body = await request.json().catch(() => ({}));
  const parsed = createReservationSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue ? `${issue.path.join(".") || "reservation"}: ${issue.message}` : "Invalid booking.",
        code: "VALIDATION_FAILED",
      },
      { status: 422 },
    );
  }

  const branchId = session.branchId;
  if (!branchId) {
    return NextResponse.json(
      { error: "Choose a branch first.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);

  // Two bookings clash when one starts before the other ends. Touching endpoints
  // are fine: a party leaving at eight can be seated at eight.
  const clashWhere = {
    organization_id: organizationId,
    branch_id: branchId,
    status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
    starts_at: { lt: endsAt },
    ends_at: { gt: startsAt },
    ...(parsed.data.tableId
      ? { table_id: parsed.data.tableId }
      : parsed.data.poolTableId
        ? { pool_table_id: parsed.data.poolTableId }
        : { id: "__none__" }),
  };

  const clash = await prisma.dunda_reservations.findFirst({ where: clashWhere });
  if (clash) {
    throw conflict(
      `${parsed.data.tableName} is already booked for ${clash.reservation_date} at ${clash.time}.`,
    );
  }

  const reservation = await prisma.dunda_reservations.create({
    data: {
      organization_id: organizationId,
      branch_id: branchId,
      customer: parsed.data.customer,
      phone: parsed.data.phone,
      // The free-text columns are kept for the older screens; the timestamps are
      // what the overlap check and the floor actually use.
      reservation_date: startsAt.toISOString().slice(0, 10),
      time: startsAt.toTimeString().slice(0, 5),
      starts_at: startsAt,
      ends_at: endsAt,
      table_name: parsed.data.tableName,
      table_id: parsed.data.tableId ?? null,
      pool_table_id: parsed.data.poolTableId ?? null,
      guests: parsed.data.guests,
      status: "PENDING",
      notes: parsed.data.notes ?? null,
    },
  });

  // A notification belongs to a person, so it is only raised when the booking
  // was made by somebody with a staff row. The reservation itself is recorded
  // either way.
  if (session.staffId) {
    await prisma.dunda_notifications.create({
      data: {
        organization_id: organizationId,
        branch_id: branchId,
        staff_id: session.staffId,
        type: "RESERVATION",
        title: "New reservation",
        message: `${reservation.customer} booked ${reservation.table_name} at ${reservation.time}`,
        reference_id: reservation.id,
      },
    });
  }

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: branchId,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "reservation",
      entity_id: reservation.id,
      detail: `${reservation.customer} booked ${reservation.table_name}`,
    },
  });

  return NextResponse.json(
    {
      id: reservation.id,
      customer: reservation.customer,
      startsAt: reservation.starts_at.toISOString(),
      endsAt: reservation.ends_at.toISOString(),
      status: reservation.status,
    },
    { status: 201 },
  );
});
