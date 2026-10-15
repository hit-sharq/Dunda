import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession, parseBody } from "@/lib/server/http";

export const dynamic = "force-dynamic";


const updatePlanSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  monthlyPrice: z.number().int().min(0),
  annualPrice: z.number().int().min(0).optional(),
  branchLimit: z.number().int().min(0).optional(),
  userLimit: z.number().int().min(0).optional(),
});

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ planId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { planId } = await context.params;
    const input = await parseBody(updatePlanSchema, request);

    const existing = await prisma.dunda_plans.findUnique({ where: { id: planId } });
    if (!existing) {
      return NextResponse.json(
        { error: "That plan no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    
    
    
    if (input.code !== existing.code) {
      return NextResponse.json(
        { error: "A plan's code cannot be changed once it is in use.", code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    const plan = await prisma.dunda_plans.update({
      where: { id: planId },
      data: {
        name: input.name,
        description: input.description ?? null,
        monthly_price: input.monthlyPrice,
        ...(input.annualPrice !== undefined ? { annual_price: input.annualPrice } : {}),
        ...(input.branchLimit !== undefined ? { branch_limit: input.branchLimit } : {}),
        ...(input.userLimit !== undefined ? { user_limit: input.userLimit } : {}),
      },
    });

    
    
    const affected = await prisma.dunda_subscriptions.count({
      where: { plan_id: plan.id, status: "ACTIVE" },
    });

    await prisma.dunda_platform_audit_logs.create({
      data: {
        actor_clerk_user_id: session.clerkUserId,
        action: "UPDATE",
        entity: "plan",
        entity_id: plan.id,
        detail: `${plan.name} now ${plan.monthly_price} monthly, ${affected} active subscription(s) unchanged`,
        previous_value: {
          name: existing.name,
          monthlyPrice: existing.monthly_price,
          annualPrice: existing.annual_price,
          branchLimit: existing.branch_limit,
          userLimit: existing.user_limit,
        },
        new_value: {
          name: plan.name,
          monthlyPrice: plan.monthly_price,
          annualPrice: plan.annual_price,
          branchLimit: plan.branch_limit,
          userLimit: plan.user_limit,
        },
      },
    });

    return NextResponse.json({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      monthlyPrice: plan.monthly_price,
      annualPrice: plan.annual_price,
      branchLimit: plan.branch_limit,
      userLimit: plan.user_limit,
      isActive: plan.is_active,
      activeSubscriptions: affected,
    });
  },
);