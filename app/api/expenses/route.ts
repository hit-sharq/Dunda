import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere, assertSameOrg } from "@/lib/server/http";
import { createExpenseSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

/** What the club spent, and what is left. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const window = {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };

  const expenses = await prisma.dunda_expenses.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      ...(Object.keys(window).length > 0 ? { expense_date: window } : {}),
    }),
    orderBy: { expense_date: "desc" },
    take: 300,
    include: { recorded_by: { select: { name: true } } },
  });

  // Revenue over the same window, so the two sides of the P&L can be read
  // together rather than from two screens with two different date pickers.
  const payments = await prisma.dunda_payments.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      status: { not: "VOIDED" },
      ...(Object.keys(window).length > 0 ? { paid_at: window } : {}),
    }),
    select: { amount: true },
  });
  const revenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const spent = expenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount);
  }

  return NextResponse.json({
    entries: expenses.map((e) => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: e.amount,
      expenseDate: e.expense_date.toISOString(),
      paymentMethod: e.payment_method,
      reference: e.reference,
      vendor: e.vendor,
      recordedBy: e.recorded_by?.name ?? null,
      notes: e.notes,
    })),
    revenue,
    expenses: spent,
    net: revenue - spent,
    byCategory: [...byCategory.entries()].map(([label, value]) => ({ label, value })),
  });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const body = await request.json().catch(() => ({}));
  const parsed = createExpenseSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue ? `${issue.path.join(".") || "expense"}: ${issue.message}` : "Invalid expense.",
        code: "VALIDATION_FAILED",
      },
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

  const expense = await prisma.dunda_expenses.create({
    data: {
      organization_id: organizationId,
      branch_id: branch.id,
      recorded_by_id: session.staffId,
      category: parsed.data.category,
      description: parsed.data.description,
      amount: parsed.data.amount,
      expense_date: new Date(parsed.data.expenseDate),
      payment_method: parsed.data.paymentMethod,
      reference: parsed.data.reference ?? null,
      vendor: parsed.data.vendor ?? null,
      notes: parsed.data.notes ?? null,
    },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: branch.id,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "expense",
      entity_id: expense.id,
      detail: `${expense.category}: ${expense.description} (${expense.amount})`,
    },
  });

  return NextResponse.json(expense, { status: 201 });
});
