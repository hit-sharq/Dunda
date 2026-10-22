import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const venueSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  currency: z.string().length(3, "Use a three letter currency code.").optional(),
  taxRate: z.number().int().min(0).max(100).optional(),
  serviceChargeRate: z.number().int().min(0).max(100).optional(),
});

/** The club's own settings: name, currency, tax and service charge. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const org = await prisma.dunda_organizations.findFirst({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      dunda_settings: {
        select: { tax_rate: true, service_charge_rate: true, timezone: true },
      },
      dunda_branches: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, city: true, status: true },
      },
    },
  });

  if (!org) {
    return NextResponse.json(
      { error: "This club is not set up.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    currency: org.currency,
    taxRate: org.dunda_settings?.tax_rate ?? 0,
    serviceChargeRate: org.dunda_settings?.service_charge_rate ?? 0,
    settings: {
      currency: org.currency,
      locale: org.dunda_settings?.timezone ?? "Africa/Nairobi",
      taxRate: org.dunda_settings?.tax_rate ?? 0,
      serviceChargeRate: org.dunda_settings?.service_charge_rate ?? 0,
    },
    branches: org.dunda_branches.map((b) => ({
      id: b.id,
      name: b.name,
      city: b.city,
      status: b.status,
    })),
  });
});

export const PATCH = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

  const session = await requirePermission("manage_branches");
  const organizationId = session.organizationId as string;

  const input = await parseBody(venueSettingsSchema, request);

  const org = await prisma.dunda_organizations.findFirst({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true, currency: true },
  });
  if (!org) {
    return NextResponse.json(
      { error: "This club is not set up.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  await prisma.$transaction(async (tx) => {
    if (input.name !== undefined || input.currency !== undefined) {
      await tx.dunda_organizations.update({
        where: { id: organizationId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
        },
      });
    }

    if (
      input.taxRate !== undefined ||
      input.serviceChargeRate !== undefined
    ) {
      await tx.dunda_organization_settings.upsert({
        where: { organization_id: organizationId },
        create: {
          organization_id: organizationId,
          currency: input.currency ?? org.currency,
          tax_rate: input.taxRate ?? 0,
          service_charge_rate: input.serviceChargeRate ?? 0,
        },
        update: {
          ...(input.taxRate !== undefined ? { tax_rate: input.taxRate } : {}),
          ...(input.serviceChargeRate !== undefined
            ? { service_charge_rate: input.serviceChargeRate }
            : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
        },
      });
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: session.staffId,
        action: "UPDATE",
        entity: "organization_settings",
        entity_id: organizationId,
        detail: "Club settings updated",
        previous_value: { name: org.name, currency: org.currency },
        new_value: {
          name: input.name ?? org.name,
          currency: input.currency ?? org.currency,
          taxRate: input.taxRate,
          serviceChargeRate: input.serviceChargeRate,
        },
      },
    });
  });

  const updated = await prisma.dunda_organizations.findFirst({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      dunda_settings: {
        select: { tax_rate: true, service_charge_rate: true, timezone: true },
      },
      dunda_branches: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, city: true, status: true },
      },
    },
  });

  if (!updated) {
    return NextResponse.json(
      { error: "This club is not set up.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    currency: updated.currency,
    taxRate: updated.dunda_settings?.tax_rate ?? 0,
    serviceChargeRate: updated.dunda_settings?.service_charge_rate ?? 0,
    settings: {
      currency: updated.currency,
      locale: updated.dunda_settings?.timezone ?? "Africa/Nairobi",
      taxRate: updated.dunda_settings?.tax_rate ?? 0,
      serviceChargeRate: updated.dunda_settings?.service_charge_rate ?? 0,
    },
    branches: updated.dunda_branches.map((b) => ({
      id: b.id,
      name: b.name,
      city: b.city,
      status: b.status,
    })),
  });
});
