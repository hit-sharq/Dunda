import { prisma } from "@/lib/db/client";
import { localeFor, type TenantSettings } from "./money";


export async function getTenantSettings(
  organizationId: string,
): Promise<TenantSettings> {
  const row = await prisma.dunda_organization_settings.findUnique({
    where: { organization_id: organizationId },
    select: {
      currency: true,
      timezone: true,
      tax_rate: true,
      service_charge_rate: true,
    },
  });

  if (row) {
    return {
      currency: row.currency,
      locale: localeFor(row.currency),
      taxRate: row.tax_rate,
      serviceChargeRate: row.service_charge_rate,
    };
  }

  
  
  const org = await prisma.dunda_organizations.findUnique({
    where: { id: organizationId },
    select: { currency: true, tax_rate: true, service_charge_rate: true },
  });

  return {
    currency: org?.currency ?? "KES",
    locale: localeFor(org?.currency ?? "KES"),
    taxRate: org?.tax_rate ?? 0,
    serviceChargeRate: org?.service_charge_rate ?? 0,
  };
}


export async function isModuleEnabled(
  organizationId: string,
  module: string,
): Promise<boolean> {
  const row = await prisma.dunda_organization_features.findUnique({
    where: { organization_id_module: { organization_id: organizationId, module } },
    select: { enabled: true },
  });
  
  
  return row?.enabled ?? true;
}


export async function featureFlags(
  organizationId: string,
): Promise<Record<string, boolean>> {
  const rows = await prisma.dunda_organization_features.findMany({
    where: { organization_id: organizationId },
    select: { module: true, enabled: true },
  });
  return Object.fromEntries(rows.map((r) => [r.module, r.enabled]));
}

export const MODULES = [
  "pos",
  "floor",
  "pool",
  "orders",
  "inventory",
  "products",
  "customers",
  "reservations",
  "events",
  "staff",
  "payments",
  "expenses",
  "reports",
] as const;

export type Module = (typeof MODULES)[number];