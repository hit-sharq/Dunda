import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  route,
  resolveSession,
  parseBody,
  NotProvisioned,
  Forbidden,
} from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const claimSchema = z.object({
  token: z.string().min(1, "That link is incomplete."),
});

/**
 * A guest who was invited to run a club claims ownership of it with the
 * token from their email. The token is bound to their address, so a link
 * that leaks cannot be used by someone else.
 */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 10, 60 * 60 * 1000);

  const session = await resolveSession();
  if (!session) throw new NotProvisioned();

  const input = await parseBody(claimSchema, request);

  const hash = createHash("sha256").update(input.token).digest("hex");
  const setup = await prisma.dunda_setup_tokens.findFirst({
    where: {
      token_hash: hash,
      purpose: "CLAIM_OWNERSHIP",
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
    select: {
      id: true,
      organization_id: true,
      owner_email: true,
      owner_name: true,
    },
  });

  if (!setup) {
    return NextResponse.json(
      {
        error: "This link has expired or has already been used.",
        code: "SETUP_LINK_UNAVAILABLE",
      },
      { status: 410 },
    );
  }

  if (!setup.organization_id) {
    return NextResponse.json(
      { error: "That link is not attached to a club.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  // The token names the person it was sent to. Check the signed-in account
  // is that person before handing over a club.
  const staff = await prisma.dunda_staff.findFirst({
    where: {
      organization_id: setup.organization_id,
      clerk_user_id: session.clerkUserId,
    },
    select: { id: true, name: true, email: true, role_id: true },
  });

  if (!staff) {
    return NextResponse.json(
      {
        error:
          "This link was sent to a different email address. Sign in with that address to claim the club.",
        code: "EMAIL_MISMATCH",
      },
      { status: 403 },
    );
  }

  const ownerRole = await prisma.dunda_roles.findFirst({
    where: { is_owner: true },
    select: { id: true, name: true },
  });
  if (!ownerRole) {
    return NextResponse.json(
      { error: "This installation has no owner role configured.", code: "NOT_CONFIGURED" },
      { status: 422 },
    );
  }

  const organization = await prisma.dunda_organizations.findUnique({
    where: { id: setup.organization_id },
    select: { id: true, name: true },
  });

  const organizationId = setup.organization_id;

  await prisma.$transaction(async (tx) => {
    await tx.dunda_staff.update({
      where: { id: staff.id },
      data: { role_id: ownerRole.id, status: "ACTIVE" },
    });

    await tx.dunda_setup_tokens.update({
      where: { id: setup.id },
      data: {
        consumed_at: new Date(),
        consumed_by_clerk_user_id: session.clerkUserId,
      },
    });

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: staff.id,
        action: "CLAIM",
        entity: "organization",
        entity_id: organizationId,
        detail: `${staff.name} claimed ownership of ${organization?.name ?? "the club"}`,
        new_value: { owner: staff.name },
      },
    });
  });

  return NextResponse.json({
    claimed: true,
    organizationId: setup.organization_id,
    organizationName: organization?.name ?? null,
    owner: { id: staff.id, name: staff.name },
  });
});
