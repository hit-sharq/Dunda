import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere, assertSameOrg } from "@/lib/server/http";
import { clockOutSchema } from "@/lib/server/schemas";
import { wrongState } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/**
 * Closes a shift and records what the till came to against what it should have.
 *
 * The expected figure is computed from the cash actually taken during this shift
 * plus the float, and stored alongside the counted figure. Both are kept: a
 * variance that only lived in a report would be gone by the time anyone asked.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ shiftId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { shiftId } = await context.params;

    const body = await request.json().catch(() => ({}));
    const parsed = clockOutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter what is in the till.", code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    const shift = await prisma.dunda_staff_shifts.findFirst({
      where: orgWhere(organizationId, { id: shiftId }),
      select: {
        id: true,
        organization_id: true,
        status: true,
        clock_out_at: true,
        clock_in_at: true,
        opening_cash: true,
        branch_id: true,
        staff_id: true,
      },
    });
    assertSameOrg(shift, organizationId, "That shift");
    if (shift.clock_out_at) throw wrongState("That shift is already closed.");

    const now = new Date();

    const cash = await prisma.dunda_payments.aggregate({
      where: {
        organization_id: organizationId,
        branch_id: shift.branch_id,
        method: "CASH",
        status: { not: "VOIDED" },
        cashier_id: shift.staff_id,
        paid_at: {
          gte: shift.clock_in_at ?? now,
          ...(shift.clock_out_at ? { lte: shift.clock_out_at } : { lte: now }),
        },
      },
      _sum: { amount: true },
    });

    const expected = shift.opening_cash + (cash._sum.amount ?? 0);
    const variance = parsed.data.closingCash - expected;

    const closed = await prisma.dunda_staff_shifts.update({
      where: { id: shift.id },
      data: {
        status: "CLOSED",
        clock_out_at: now,
        closing_cash: parsed.data.closingCash,
        expected_cash: expected,
        variance,
        notes: parsed.data.notes ?? null,
      },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: shift.branch_id,
        staff_id: shift.staff_id,
        action: "UPDATE",
        entity: "shift",
        entity_id: shift.id,
        detail: `Shift closed with ${variance === 0 ? "no variance" : `${variance > 0 ? "+" : ""}${variance} variance`}`,
        previous_value: { status: shift.status },
        new_value: { status: "CLOSED", expected, actual: parsed.data.closingCash, variance },
        reason: parsed.data.notes ?? null,
      },
    });

    return NextResponse.json({
      id: closed.id,
      expectedCash: expected,
      closingCash: closed.closing_cash,
      variance,
    });
  },
);
