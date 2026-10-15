import { prisma } from "./client";

export class TenantViolation extends Error {
  readonly code = "TENANT_VIOLATION";

  constructor(resource: string) {
    super(`Record is not owned by the current organization: ${resource}`);
    this.name = "TenantViolation";
  }
}


export function scopeOrg<T extends object>(organizationId: string, where?: T) {
  return { organization_id: organizationId, ...where } as T & {
    organization_id: string;
  };
}


export function assertOwned(
  row: { organization_id: string } | null | undefined,
  organizationId: string,
  resource: string,
): void {
  if (!row || row.organization_id !== organizationId) {
    throw new TenantViolation(resource);
  }
}

export function countRows(
  organizationId: string,
  model: "dunda_products" | "dunda_staff" | "dunda_tabs" | "dunda_orders",
): Promise<number> {
  const delegate = prisma[model] as unknown as {
    count(args: { where: { organization_id: string } }): Promise<number>;
  };
  return delegate.count({ where: { organization_id: organizationId } });
}