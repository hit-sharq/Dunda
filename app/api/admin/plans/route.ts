import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** The plans the platform sells, with what each one allows. */
export const GET = route(async () => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const plans = await prisma.dunda_plans.findMany({
    orderBy: { sort_order: "asc" },
  });

  // How many clubs sit on each plan, so the owner can see what is actually being
  // bought rather than what the pricing page offers.
  const counts = await prisma.dunda_subscriptions.groupBy({
    by: ["plan_id"],
    _count: { _all: true },
  });
  const countByPlan = new Map(counts.map((c) => [c.plan_id, c._count._all]));

  return NextResponse.json(
    plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      monthlyPrice: plan.monthly_price,
      annualPrice: plan.annual_price,
      branchLimit: plan.branch_limit,
      userLimit: plan.user_limit,
      modules: plan.modules,
      isActive: plan.is_active,
      isPopular: plan.code === "PROFESSIONAL",
      sortOrder: plan.sort_order,
      organizations: plan.id ? (countByPlan.get(plan.id) ?? 0) : (countByPlan.get(null) ?? 0),
    })),
  );
});

/** Creates or edits a plan. Pricing is never hardcoded in the application. */
export const POST = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    code?: string;
    name?: string;
    description?: string | null;
    monthlyPrice?: number;
    annualPrice?: number;
    branchLimit?: number;
    userLimit?: number;
    modules?: string[];
  };

  if (!body.code || !body.name || body.monthlyPrice === undefined) {
    return NextResponse.json(
      { error: "A plan needs a code, a name and a monthly price.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  // Prices are whole currency units and are never negative. A plan the platform
  // gives away for free is legitimate; one that pays the platform is not.
  if (body.monthlyPrice < 0 || (body.annualPrice ?? 0) < 0) {
    return NextResponse.json(
      { error: "A price cannot be negative.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const plan = body.id
    ? await prisma.dunda_plans.update({
        where: { id: body.id },
        data: {
          name: body.name,
          description: body.description ?? null,
          monthly_price: body.monthlyPrice,
          annual_price: body.annualPrice ?? 0,
          ...(body.branchLimit !== undefined ? { branch_limit: body.branchLimit } : {}),
          ...(body.userLimit !== undefined ? { user_limit: body.userLimit } : {}),
          ...(body.modules ? { modules: body.modules } : {}),
        },
      })
    : await prisma.dunda_plans.create({
        data: {
          code: body.code,
          name: body.name,
          description: body.description ?? null,
          monthly_price: body.monthlyPrice,
          annual_price: body.annualPrice ?? 0,
          branch_limit: body.branchLimit ?? 1,
          user_limit: body.userLimit ?? 5,
          modules: body.modules ?? [],
        },
      });

  await prisma.dunda_platform_audit_logs.create({
    data: {
      actor_clerk_user_id: session.clerkUserId,
      action: body.id ? "UPDATE" : "CREATE",
      entity: "plan",
      entity_id: plan.id,
      detail: `${body.id ? "Edited" : "Created"} plan ${plan.name}`,
      new_value: {
        monthlyPrice: plan.monthly_price,
        annualPrice: plan.annual_price,
      },
    },
  });

  return NextResponse.json(
    { id: plan.id, code: plan.code, name: plan.name, monthlyPrice: plan.monthly_price },
    { status: body.id ? 200 : 201 },
  );
});
