import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession, parseBody } from "@/lib/server/http";
import { initiateBillingPayment } from "@/lib/server/payments";

export const dynamic = "force-dynamic";

/**
 * Sets what a club pays.
 *
 * The price lives on the subscription rather than being copied from the plan, so
 * a plan's price can move without rewriting every club that once sat on it — and a
 * club negotiated onto a bespoke figure keeps it when the catalogue changes.
 */
const setSubscriptionSchema = z.object({
  planId: z.string().nullable().optional(),
  monthlyPrice: z.number().int().min(0).nullable().optional(),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]).optional(),
  status: z
    .enum([
      "TRIAL",
      "ACTIVE",
      "PAST_DUE",
      "PAYMENT_PENDING",
      "PAYMENT_FAILED",
      "CANCELLED",
      "EXPIRED",
      "SUSPENDED",
    ])
    .optional(),
  renewsAt: z.string().nullable().optional(),
  autoRenew: z.boolean().optional(),
});

const STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CANCELLED",
  "EXPIRED",
  "SUSPENDED",
] as const;

export const POST = route(
  async (request: Request, context: { params: Promise<{ organizationId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { organizationId } = await context.params;
    const input = await parseBody(setSubscriptionSchema, request);

    const organization = await prisma.dunda_organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!organization) {
      return NextResponse.json(
        { error: "That club no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // A plan's price is the default; an explicit price on the subscription is a
    // figure this club agreed, so it wins.
    let amount = input.monthlyPrice ?? null;
    let planCode: string | null = null;
    let branchLimit: number | undefined;
    let userLimit: number | undefined;

    if (input.planId) {
      const plan = await prisma.dunda_plans.findUnique({ where: { id: input.planId } });
      if (!plan) {
        return NextResponse.json(
          { error: "That plan no longer exists.", code: "NOT_FOUND" },
          { status: 404 },
        );
      }
      planCode = plan.code;
      branchLimit = plan.branch_limit;
      userLimit = plan.user_limit;
      amount = input.monthlyPrice ?? plan.monthly_price;
    }

    if (amount !== null && amount < 0) {
      return NextResponse.json(
        { error: "A price cannot be negative.", code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    const existing = await prisma.dunda_subscriptions.findFirst({
      where: { organization_id: organizationId },
      orderBy: { created_at: "desc" },
    });

    const data: Record<string, unknown> = {};
    if (input.planId !== undefined) data.plan_id = input.planId;
    if (planCode !== null) data.plan = planCode;
    if (input.billingCycle) data.billing_cycle = input.billingCycle;
    if (input.status) {
      data.status = input.status;
      // Cancelling is dated, so the console can show when it happened. Uncancelling
      // clears it, because leaving a cancellation date on an active club is a lie.
      data.cancelled_at = input.status === "CANCELLED" ? new Date() : null;
    }
    if (amount !== null) data.amount = amount;
    if (branchLimit !== undefined) data.branch_limit = branchLimit;
    if (userLimit !== undefined) data.user_limit = userLimit;
    if (input.renewsAt !== undefined) {
      data.renews_at = input.renewsAt ? new Date(input.renewsAt) : null;
    }
    // Automatic renewal is the club's
    // choice to make, so the console can
    // turn a mandate offer off — and back
    // on — without touching anything else.
    if (input.autoRenew !== undefined) {
      data.auto_renew = input.autoRenew;
    }
    if (input.status === "ACTIVE" && !existing?.started_at) data.started_at = new Date();

    const subscription = existing
      ? await prisma.dunda_subscriptions.update({ where: { id: existing.id }, data })
      : await prisma.dunda_subscriptions.create({
          data: {
            organization_id: organizationId,
            plan_id: input.planId ?? null,
            plan: planCode ?? "STARTER",
            status: input.status ?? "TRIAL",
            billing_cycle: input.billingCycle ?? "MONTHLY",
            amount: amount ?? 0,
            branch_limit: branchLimit ?? 1,
            user_limit: userLimit ?? 5,
            started_at: input.status === "ACTIVE" ? new Date() : null,
            ...data,
          },
        });

    // Usage is counted from the club's real rows rather than accepted from the
    // caller, so the console cannot be made to show a club within its limits when
    // it has more branches than the plan allows.
    const [branches, users] = await Promise.all([
      prisma.dunda_branches.count({ where: { organization_id: organizationId } }),
      prisma.dunda_staff.count({
        where: { organization_id: organizationId, status: "ACTIVE" },
      }),
    ]);
    await prisma.dunda_subscriptions.update({
      where: { id: subscription.id },
      data: { current_branches: branches, current_users: users },
    });

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: organizationId,
        actor_clerk_user_id: session.clerkUserId,
        action: "UPDATE",
        entity: "subscription",
        entity_id: subscription.id,
        detail: `${organization.name} subscription set to ${subscription.status} at ${subscription.amount}`,
        previous_value: existing
          ? {
              planId: existing.plan_id,
              status: existing.status,
              amount: existing.amount,
              billingCycle: existing.billing_cycle,
            }
          : undefined,
        new_value: {
          planId: subscription.plan_id,
          status: subscription.status,
          amount: subscription.amount,
          billingCycle: subscription.billing_cycle,
        },
      },
    });

    // A club's first bill goes out with its first
    // plan: the owner pays before the software is
    // theirs to run, rather than being chased
    // afterwards. A deployment without a provider
    // still provisions the club — the operator
    // collects by hand from the console instead.
    let payment: {
      billingPaymentId: string;
      orderTrackingId: string;
      redirectUrl: string;
      amount: number;
      currency: string;
    } | null = null;
    if (!existing && subscription.amount > 0) {
      payment = await initiateBillingPayment({
        organizationId,
        subscriptionId: subscription.id,
        kind: "SUBSCRIPTION_FIRST",
        // The mandate is offered unless the
        // operator explicitly turned it off.
        autoRenew: input.autoRenew ?? true,
      })
        .then((initiation) => ({
          billingPaymentId: initiation.billingPaymentId,
          orderTrackingId: initiation.orderTrackingId,
          redirectUrl: initiation.redirectUrl,
          amount: initiation.amount,
          currency: initiation.currency,
        }))
        .catch((error: unknown) => {
          console.error(
            "[dunda] could not start the first subscription payment",
            error,
          );
          return null;
        });
    }

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        organizationId,
        plan: subscription.plan,
        planId: subscription.plan_id,
        status: subscription.status,
        billingCycle: subscription.billing_cycle,
        branchLimit: subscription.branch_limit,
        userLimit: subscription.user_limit,
        currentBranches: branches,
        currentUsers: users,
        renewsAt: subscription.renews_at?.toISOString() ?? null,
      },
      monthlyPrice: amount,
      usage: {
        branches,
        branchLimit: subscription.branch_limit,
        users,
        userLimit: subscription.user_limit,
      },
      // The link the club's owner pays on, so the
      // console can send it and the club's own
      // screen can offer it.
      payment,
      statuses: STATUSES,
    });
  },
);
