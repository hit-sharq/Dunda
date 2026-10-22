import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const updateBranchSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "LIVE", "CLOSED"]).optional(),
});

function branchShape(b: any) {
  return {
    id: b.id,
    name: b.name,
    city: b.city,
    status: b.status,
    address: b.address,
    phone: b.phone,
    email: b.email,
  };
}

export const GET = route(
  async (request: Request, context: { params: Promise<{ branchId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { branchId } = await context.params;

    const branch = await prisma.dunda_branches.findFirst({
      where: orgWhere(organizationId, { id: branchId }),
      select: {
        id: true,
        name: true,
        city: true,
        status: true,
        address: true,
        phone: true,
        email: true,
      },
    });
    if (!branch) throw notFound("That branch");

    return NextResponse.json(branchShape(branch));
  },
);

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ branchId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("manage_branches");
    const organizationId = session.organizationId as string;
    const { branchId } = await context.params;

    const branch = await prisma.dunda_branches.findFirst({
      where: orgWhere(organizationId, { id: branchId }),
      select: { id: true, name: true, status: true },
    });
    if (!branch) throw notFound("That branch");

    const input = await parseBody(updateBranchSchema, request);

    const updated = await prisma.dunda_branches.update({
      where: { id: branchId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      select: {
        id: true,
        name: true,
        city: true,
        status: true,
        address: true,
        phone: true,
        email: true,
      },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: branchId,
        staff_id: session.staffId,
        action: "UPDATE",
        entity: "branch",
        entity_id: branchId,
        detail: `Branch ${updated.name} updated`,
        previous_value: { name: branch.name, status: branch.status },
        new_value: { name: updated.name, status: updated.status },
      },
    });

    return NextResponse.json(branchShape(updated));
  },
);
