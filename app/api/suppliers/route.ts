import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const supplierSchema = z.object({
  name: z.string().min(1, "Give the supplier a name."),
  contact: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

function supplierShape(s: any) {
  return {
    id: s.id,
    name: s.name,
    contact: s.contact,
    phone: s.phone,
    email: s.email,
    address: s.address,
  };
}

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const suppliers = await prisma.dunda_suppliers.findMany({
    where: { organization_id: organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      contact: true,
      phone: true,
      email: true,
      address: true,
    },
  });

  return NextResponse.json(suppliers.map(supplierShape));
});

export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

  const session = await requirePermission("adjust_inventory");
  const organizationId = session.organizationId as string;

  const input = await parseBody(supplierSchema, request);

  const created = await prisma.dunda_suppliers.create({
    data: {
      organization_id: organizationId,
      name: input.name,
      contact: input.contact ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
    },
    select: {
      id: true,
      name: true,
      contact: true,
      phone: true,
      email: true,
      address: true,
    },
  });

  await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: session.staffId,
        action: "CREATE",
        entity: "supplier",
        entity_id: created.id,
        detail: `Supplier ${created.name} added`,
        new_value: { name: created.name },
      },
    });

  return NextResponse.json(supplierShape(created), { status: 201 });
});
