import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  route,
  requirePermission,
  requireSession,
  orgWhere,
  parseBody,
  Forbidden,
  NotProvisioned,
} from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const addBranchMemberSchema = z.object({
  clerkUserId: z.string().min(1, "A Clerk user id is required."),
  roleId: z.string().min(1, "Pick a role for them."),
});

export const GET = route(
  async (request: Request, context: { params: Promise<{ branchId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { branchId } = await context.params;

    const members = await prisma.dunda_branch_members.findMany({
      where: orgWhere(organizationId, { branchId }),
      orderBy: { joined_at: "desc" },
      select: {
        id: true,
        clerk_user_id: true,
        role_id: true,
        status: true,
        joined_at: true,
        dunda_roles: { select: { id: true, name: true, is_owner: true } },
      },
    });

    return NextResponse.json(
      members.map((m) => ({
        id: m.id,
        clerkUserId: m.clerk_user_id,
        role: m.dunda_roles.name,
        roleId: m.dunda_roles.id,
        isOwner: m.dunda_roles.is_owner,
        status: m.status,
        joinedAt: m.joined_at.toISOString(),
      })),
    );
  },
);

export const POST = route(
  async (request: Request, context: { params: Promise<{ branchId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("manage_staff");
    const organizationId = session.organizationId as string;
    const { branchId } = await context.params;

    const branch = await prisma.dunda_branches.findFirst({
      where: orgWhere(organizationId, { id: branchId }),
      select: { id: true, name: true },
    });
    if (!branch) {
      return NextResponse.json(
        { error: "That branch is not part of this club.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const input = await parseBody(addBranchMemberSchema, request);

    const existing = await prisma.dunda_branch_members.findFirst({
      where: orgWhere(organizationId, { branchId, clerk_user_id: input.clerkUserId }),
      select: { id: true, status: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "That person is already a member of this branch.",
          code: "DUPLICATE_MEMBER",
          memberId: existing.id,
          status: existing.status,
        },
        { status: 409 },
      );
    }

    const role = await prisma.dunda_roles.findUnique({
      where: { id: input.roleId },
      select: { id: true, name: true, is_owner: true },
    });
    if (!role) {
      return NextResponse.json(
        { error: "That role no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (role.is_owner) {
      return NextResponse.json(
        {
          error: "The owner role is transferred, not assigned.",
          code: "VALIDATION_FAILED",
        },
        { status: 422 },
      );
    }

    const member = await prisma.dunda_branch_members.create({
      data: {
        organization_id: organizationId,
        branch_id: branchId,
        clerk_user_id: input.clerkUserId,
        role_id: role.id,
        status: "ACTIVE",
      },
      select: { id: true, clerk_user_id: true, role_id: true, status: true },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: branchId,
        staff_id: session.staffId,
        action: "CREATE",
        entity: "branch_member",
        entity_id: member.id,
        detail: `${input.clerkUserId} added to ${branch.name} as ${role.name}`,
      },
    });

    return NextResponse.json(
      {
        id: member.id,
        clerkUserId: member.clerk_user_id,
        roleId: member.role_id,
        status: member.status,
      },
      { status: 201 },
    );
  },
);

export const DELETE = route(
  async (request: Request, context: { params: Promise<{ branchId: string }> }) => {
    const session = await requirePermission("manage_staff");
    const organizationId = session.organizationId as string;
    const { branchId } = await context.params;

    const url = new URL(request.url);
    const memberId = url.searchParams.get("memberId");
    if (!memberId) {
      return NextResponse.json(
        { error: "Which member?", code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    const member = await prisma.dunda_branch_members.findFirst({
      where: orgWhere(organizationId, { branch_id: branchId, id: memberId }),
      select: { id: true, clerk_user_id: true, status: true, dunda_roles: { select: { is_owner: true } } },
    });
    if (!member) {
      return NextResponse.json(
        { error: "That person is not a member of this branch.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (member.dunda_roles.is_owner) {
      return NextResponse.json(
        { error: "The branch owner cannot be removed.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    await prisma.dunda_branch_members.update({
      where: { id: memberId },
      data: { status: "REMOVED" },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: branchId,
        staff_id: session.staffId,
        action: "REMOVE",
        entity: "branch_member",
        entity_id: member.id,
        detail: `${member.clerk_user_id} removed from ${branchId}`,
      },
    });

    return NextResponse.json({ id: memberId, status: "REMOVED" });
  },
);
