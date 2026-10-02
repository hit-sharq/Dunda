import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";
import { clockOutSchema, createShiftSchema } from "@/lib/server/schemas";
import { moneyRule, wrongState } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/**
 * Shifts, with the cash variance each one ended on.
 *
 * Expected cash is the float plus the cash taken during the shift. The variance is
 * reported rather than corrected: a till that does not balance is a fact the
 * manager needs to see, not something to quietly write off.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const openOnly = url.searchParams.get("open") === "true";

  const shifts = await prisma.dunda_staff_shifts.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      ...(openOnly ? { clock_out_at: null, status: "OPEN" } : {}),
    }),
    orderBy: { created_at: "desc" },
    take: 100,
    include: { dunda_staff: { select: { id: true, name: true } } },
  });

  const results = await Promise.all(
    shifts.map(async (shift) => {
      const cash = await prisma.dunda_payments.aggregate({
        where: {
          organization_id: organizationId,
          branch_id: shift.branch_id,
          method: "CASH",
          status: { not: "VOIDED" },
          cashier_id: shift.staff_id,
          paid_at: {
            gte: shift.clock_in_at ?? shift.created_at,
            ...(shift.clock_out_at ? { lte: shift.clock_out_at } : {}),
          },
        },
        _sum: { amount: true },
      });

      const opening = shift.opening_cash;
      const cashTaken = cash._sum.amount ?? 0;
      const expected = opening + cashTaken;
      const actual = shift.closing_cash;

      return {
        id: shift.id,
        staffId: shift.staff_id,
        staffName: shift.dunda_staff.name,
        status: shift.status,
        clockInAt: shift.clock_in_at?.toISOString() ?? null,
        clockOutAt: shift.clock_out_at?.toISOString() ?? null,
        durationMinutes:
          shift.clock_in_at && (shift.clock_out_at ?? new Date())
            ? Math.max(
                0,
                Math.round(
                  ((shift.clock_out_at ?? new Date()).getTime() - shift.clock_in_at.getTime()) /
                    60000,
                ),
              )
            : null,
        openingCash: opening,
        cashTaken,
        expectedCash: expected,
        closingCash: actual,
        variance: actual === null ? null : actual - expected,
        notes: shift.notes,
      };
    }),
  );

  return NextResponse.json(results);
});

/** Clock in, with the float the person is starting the till with. */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const body = await request.json().catch(() => ({}));
  const parsed = createShiftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A shift needs a staff member and an opening float.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const member = await prisma.dunda_staff.findFirst({
    where: orgWhere(organizationId, { id: parsed.data.staffId }),
    select: { id: true, name: true, branch_id: true },
  });
  if (!member) {
    return NextResponse.json(
      { error: "That staff member is not part of this club.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // Two open shifts for one person means the till is counted twice. Refused rather
  // than closed silently, because only the person holding it knows which is real.
  const already = await prisma.dunda_staff_shifts.findFirst({
    where: { staff_id: member.id, clock_out_at: null, status: "OPEN" },
  });
  if (already) {
    throw wrongState(`${member.name} is already clocked in.`);
  }

  const branchId = parsed.data.branchId ?? member.branch_id ?? session.branchId;
  if (!branchId) {
    return NextResponse.json(
      { error: "Choose a branch first.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const shift = await prisma.dunda_staff_shifts.create({
    data: {
      organization_id: organizationId,
      branch_id: branchId,
      staff_id: member.id,
      status: "OPEN",
      clock_in_at: new Date(),
      opening_cash: parsed.data.openingCash,
      notes: parsed.data.notes ?? null,
    },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: branchId,
      staff_id: member.id,
      action: "CREATE",
      entity: "shift",
      entity_id: shift.id,
      detail: `${member.name} clocked in with ${parsed.data.openingCash} float`,
    },
  });

  return NextResponse.json(
    { id: shift.id, staffId: member.id, clockInAt: shift.clock_in_at?.toISOString() ?? null },
    { status: 201 },
  );
});
