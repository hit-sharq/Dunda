import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/client";
import {
  Forbidden,
  NotProvisioned,
  resolveSession,
  route,
  parseBody,
} from "@/lib/server/http";
import { invitationFailureReason } from "@/lib/server/clerk";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const createSetupLinkSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(120).optional(),
  planId: z.string().optional(),
});

export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 10, 60 * 60 * 1000);

  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const input = await parseBody(createSetupLinkSchema, request);
  const plan = input.planId
    ? await prisma.dunda_plans.findFirst({ where: { id: input.planId, is_active: true } })
    : await prisma.dunda_plans.findFirst({ where: { is_active: true }, orderBy: { sort_order: "asc" } });
  if (!plan) {
    return NextResponse.json(
      { error: "There is no active plan to attach to this setup link.", code: "NO_ACTIVE_PLAN" },
      { status: 422 },
    );
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const setupToken = await prisma.dunda_setup_tokens.create({
    data: {
      token_hash: tokenHash,
      purpose: "CREATE_ORGANIZATION",
      owner_email: input.email.toLowerCase(),
      owner_name: input.name || null,
      plan_id: plan.id,
      created_by_clerk_user_id: session.clerkUserId,
      expires_at: expiresAt,
    },
  });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  const setupUrl = `${appUrl}/setup/${rawToken}`;
  let invitation: { sent: boolean; reason?: string } = { sent: false };
  try {
    const clerk = await clerkClient();
    await clerk.invitations.createInvitation({
      emailAddress: input.email.toLowerCase(),
      expiresInDays: 7,
      redirectUrl: setupUrl,
    });
    invitation = { sent: true };
  } catch (error) {
    invitation = { sent: false, reason: invitationFailureReason(error) };
  }

  await prisma.dunda_platform_audit_logs.create({
    data: {
      actor_clerk_user_id: session.clerkUserId,
      action: "CREATE",
      entity: "owner_setup_link",
      entity_id: setupToken.id,
      detail: `Owner setup link created for ${input.email.toLowerCase()} on ${plan.name}`,
      new_value: { email: input.email.toLowerCase(), plan: plan.name, expiresAt: expiresAt.toISOString() },
    },
  });

  return NextResponse.json({
    setupUrl,
    expiresAt: expiresAt.toISOString(),
    plan: { id: plan.id, name: plan.name, monthlyPrice: plan.monthly_price },
    invitation,
  }, { status: 201 });
});