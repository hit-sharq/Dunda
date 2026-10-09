import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  route,
  Forbidden,
  NotProvisioned,
  resolveSession,
  orgWhere,
  parseBody,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";

const addBranchSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  timezone: z.string().min(1).optional(),
});

/**
 * Opens a branch on a club, on the platform owner's behalf.
 *
 * The club's plan limit still applies: an operator who needs
 * more branches for a club changes the plan first, because
 * the limit is what the club pays for.
 */
export const POST = route(
  async (
    request: Request,
    context: { params: Promise<{ organizationId: string }> },
  ) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { organizationId } = await context.params;
    const input = await parseBody(addBranchSchema, request);

    const subscription = await prisma.dunda_subscriptions.findFirst({
      where: { organization_id: organizationId },
      orderBy: { created_at: "desc" },
      select: { branch_limit: true },
    });
    const branchLimit = subscription?.branch_limit ?? 1;
    const branchCount = await prisma.dunda_branches.count({
      where: orgWhere(organizationId),
    });
    if (branchLimit > 0 && branchCount >= branchLimit) {
      return NextResponse.json(
        {
          error: `This club's plan allows ${branchLimit} branch${branchLimit === 1 ? "" : "es"}. Change the plan to open another.`,
          code: "BRANCH_LIMIT_REACHED",
          branchLimit,
        },
        { status: 422 },
      );
    }

    const branch = await prisma.dunda_branches.create({
      data: {
        organization_id: organizationId,
        name: input.name.trim(),
        city: input.city.trim(),
        address: input.address?.trim() ?? null,
        phone: input.phone?.trim() ?? null,
        email: input.email?.trim() ?? null,
        timezone: input.timezone ?? "Africa/Nairobi",
      },
    });

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: organizationId,
        actor_clerk_user_id: session.clerkUserId,
        action: "CREATE",
        entity: "branch",
        entity_id: branch.id,
        detail: `${branch.name} opened in ${branch.city} by a platform operator`,
        new_value: { name: branch.name, city: branch.city },
      },
    });

    return NextResponse.json(
      {
        id: branch.id,
        name: branch.name,
        city: branch.city,
        address: branch.address,
        status: branch.status,
        timezone: branch.timezone,
        phone: branch.phone,
        email: branch.email,
      },
      { status: 201 },
    );
  },
);
