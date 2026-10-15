import { createHash } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ApiError } from "@/lib/errors.server";
import { initiateBillingPayment } from "@/lib/server/payments";
import { route, resolveSession, parseBody } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const finishSetupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  branchName: z.string().trim().min(2).max(120).default("Main Branch"),
  city: z.string().trim().max(120).default(""),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("KES"),
  taxRate: z.number().int().min(0).max(100).default(16),
  serviceChargeRate: z.number().int().min(0).max(100).default(10),
  autoRenew: z.boolean().default(false),
});

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function findAvailableSetup(token: string) {
  return prisma.dunda_setup_tokens.findFirst({
    where: {
      token_hash: tokenHash(token),
      purpose: "CREATE_ORGANIZATION",
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
  });
}

export const GET = route(async (_request: Request, context: { params: Promise<{ token: string }> }) => {
  const { token } = await context.params;
  const setup = await findAvailableSetup(token);
  if (!setup) {
    return NextResponse.json(
      { error: "This setup link has expired or has already been used.", code: "SETUP_LINK_UNAVAILABLE" },
      { status: 410 },
    );
  }

  const plan = setup.plan_id
    ? await prisma.dunda_plans.findUnique({ where: { id: setup.plan_id } })
    : null;
  if (!plan || !plan.is_active) {
    return NextResponse.json(
      { error: "The plan selected for this setup link is no longer available. Contact the person who sent it.", code: "SETUP_PLAN_UNAVAILABLE" },
      { status: 410 },
    );
  }

  return NextResponse.json({
    ownerEmail: setup.owner_email,
    ownerName: setup.owner_name,
    expiresAt: setup.expires_at.toISOString(),
    plan: {
      name: plan.name,
      monthlyPrice: plan.monthly_price,
      annualPrice: plan.annual_price,
      currency: "KES",
    },
  });
});

export const POST = route(async (request: Request, context: { params: Promise<{ token: string }> }) => {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in or create an account to continue.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (session.organizationId || session.staffId) {
    return NextResponse.json(
      { error: "This account is already attached to a club. Sign in with the email address invited to this setup link.", code: "ACCOUNT_ALREADY_LINKED" },
      { status: 409 },
    );
  }

  const { token } = await context.params;
  const setup = await findAvailableSetup(token);
  if (!setup) {
    return NextResponse.json(
      { error: "This setup link has expired or has already been used.", code: "SETUP_LINK_UNAVAILABLE" },
      { status: 410 },
    );
  }

  const recentFailures = await prisma.dunda_setup_token_attempts.count({
    where: {
      token_id: setup.id,
      succeeded: false,
      created_at: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recentFailures >= 5) {
    return NextResponse.json(
      { error: "Too many attempts for this setup link. Ask the person who sent it to issue a new one.", code: "SETUP_ATTEMPTS_LIMIT" },
      { status: 429 },
    );
  }

  const body = await parseBody(finishSetupSchema, request);
  const clerk = await clerkClient();
  let user;
  try {
    user = await clerk.users.getUser(session.clerkUserId);
  } catch {
    return NextResponse.json(
      { error: "We could not verify your sign-in. Try again shortly.", code: "IDENTITY_PROVIDER_UNAVAILABLE" },
      { status: 503 },
    );
  }
  const primaryEmail = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  const accountEmail = primaryEmail?.emailAddress.trim().toLowerCase();
  if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
    return NextResponse.json(
      { error: "Verify your email address with Clerk before creating the club.", code: "EMAIL_NOT_VERIFIED" },
      { status: 403 },
    );
  }
  if (!setup.owner_email || accountEmail !== setup.owner_email.toLowerCase()) {
    await prisma.dunda_setup_token_attempts.create({
      data: {
        token_id: setup.id,
        clerk_user_id: session.clerkUserId,
        succeeded: false,
        reason: "INVITED_EMAIL_MISMATCH",
      },
    });
    return NextResponse.json(
      { error: `This link was sent to ${setup.owner_email ?? "another email address"}. Sign in with that verified address to continue.`, code: "SETUP_EMAIL_MISMATCH" },
      { status: 403 },
    );
  }

  const plan = setup.plan_id
    ? await prisma.dunda_plans.findFirst({ where: { id: setup.plan_id, is_active: true } })
    : null;
  if (!plan) {
    return NextResponse.json(
      { error: "The plan selected for this setup link is no longer available. Contact the person who sent it.", code: "SETUP_PLAN_UNAVAILABLE" },
      { status: 410 },
    );
  }

  const ownerRole = await prisma.dunda_roles.findFirst({ where: { is_owner: true } });
  if (!ownerRole) {
    return NextResponse.json(
      { error: "Club setup is temporarily unavailable because the Owner role is not configured.", code: "OWNER_ROLE_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const ownerName = setup.owner_name?.trim()
    || [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
    || accountEmail;

  const created = await prisma.$transaction(async (tx) => {
    const currentSetup = await tx.dunda_setup_tokens.findFirst({
      where: {
        id: setup.id,
        purpose: "CREATE_ORGANIZATION",
        consumed_at: null,
        expires_at: { gt: new Date() },
      },
    });
    if (!currentSetup) throw new ApiError(410, "This setup link has expired or has already been used.", { code: "SETUP_LINK_UNAVAILABLE" });

    const baseSlug = body.name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "club";
    let slug = baseSlug;
    for (let suffix = 2; await tx.dunda_organizations.findUnique({ where: { slug }, select: { id: true } }); suffix++) {
      slug = `${baseSlug}-${suffix}`;
      if (suffix > 100) throw new ApiError(409, "We could not find an available club URL. Contact support to finish setup.", { code: "SLUG_UNAVAILABLE" });
    }

    const organization = await tx.dunda_organizations.create({
      data: {
        name: body.name,
        slug,
        currency: body.currency,
        tax_rate: body.taxRate,
        service_charge_rate: body.serviceChargeRate,
        status: "ACTIVE",
        last_activity_at: new Date(),
      },
    });
    const branch = await tx.dunda_branches.create({
      data: {
        organization_id: organization.id,
        name: body.branchName,
        city: body.city,
        status: "ACTIVE",
        timezone: "Africa/Nairobi",
      },
    });
    await tx.dunda_organization_settings.create({
      data: {
        organization_id: organization.id,
        currency: body.currency,
        timezone: "Africa/Nairobi",
        tax_rate: body.taxRate,
        service_charge_rate: body.serviceChargeRate,
      },
    });
    for (const module of [
      "pos", "floor", "pool", "orders", "inventory", "products", "customers",
      "reservations", "events", "staff", "payments", "expenses", "reports",
    ]) {
      await tx.dunda_organization_features.create({ data: { organization_id: organization.id, module, enabled: true } });
    }

    const subscription = await tx.dunda_subscriptions.create({
      data: {
        organization_id: organization.id,
        plan_id: plan.id,
        plan: plan.code,
        status: "TRIAL",
        billing_cycle: "MONTHLY",
        amount: plan.monthly_price,
        currency: body.currency,
        branch_limit: plan.branch_limit,
        user_limit: plan.user_limit,
        current_branches: 1,
        trial_ends_at: trialEndsAt,
      },
    });
    const owner = await tx.dunda_staff.create({
      data: {
        organization_id: organization.id,
        branch_id: branch.id,
        clerk_user_id: session.clerkUserId,
        name: ownerName,
        email: accountEmail,
        role_id: ownerRole.id,
        status: "ACTIVE",
      },
    });
    await tx.dunda_organization_members.create({
      data: {
        organization_id: organization.id,
        clerk_user_id: session.clerkUserId,
        role_id: ownerRole.id,
        status: "ACTIVE",
      },
    });
    await tx.dunda_branch_members.create({
      data: {
        organization_id: organization.id,
        branch_id: branch.id,
        clerk_user_id: session.clerkUserId,
        role_id: ownerRole.id,
        status: "ACTIVE",
      },
    });

    const consumed = await tx.dunda_setup_tokens.updateMany({
      where: { id: currentSetup.id, consumed_at: null, expires_at: { gt: new Date() } },
      data: {
        organization_id: organization.id,
        consumed_at: new Date(),
        consumed_by_clerk_user_id: session.clerkUserId,
      },
    });
    if (consumed.count !== 1) throw new ApiError(409, "This setup link has already been used.", { code: "SETUP_LINK_UNAVAILABLE" });

    await tx.dunda_setup_token_attempts.create({
      data: { token_id: currentSetup.id, clerk_user_id: session.clerkUserId, succeeded: true },
    });
    await tx.dunda_platform_audit_logs.create({
      data: {
        organization_id: organization.id,
        actor_clerk_user_id: session.clerkUserId,
        action: "CREATE",
        entity: "organization",
        entity_id: organization.id,
        detail: `${organization.name} created by its owner through an invitation link`,
        new_value: { slug, plan: plan.code, branch: branch.name },
      },
    });

    return { organization, branch, subscription, owner };
  });

  let payment: { redirectUrl: string; amount: number; currency: string } | null = null;
  let paymentFailed = false;
  if (created.subscription.amount > 0) {
    payment = await initiateBillingPayment({
      organizationId: created.organization.id,
      subscriptionId: created.subscription.id,
      kind: "SUBSCRIPTION_FIRST",
      autoRenew: body.autoRenew,
    })
      .then(({ redirectUrl, amount, currency }) => ({ redirectUrl, amount, currency }))
      .catch((error: unknown) => {
        console.error("[dunda] could not start the owner setup subscription payment", error);
        paymentFailed = true;
        return null;
      });
  }

  return NextResponse.json({
    organization: {
      id: created.organization.id,
      name: created.organization.name,
      slug: created.organization.slug,
    },
    branch: { id: created.branch.id, name: created.branch.name },
    owner: { id: created.owner.id, name: created.owner.name, email: created.owner.email },
    plan: { name: plan.name, monthlyPrice: plan.monthly_price, currency: body.currency },
    trialEndsAt: trialEndsAt.toISOString(),
    payment,
    paymentFailed,
  }, { status: 201 });
});