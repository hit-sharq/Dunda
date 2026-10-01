import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, auditLogsTable, organizationsTable, branchesTable } from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import { getTenantSettings } from "../lib/tenantSettings";
import { logAuditEntry } from "../lib/auditLogger";
import type { StaffContext } from "../lib/permissions";

const router: IRouter = Router();

function can(req: any, permission: string): boolean {
  const ctx: StaffContext | undefined = req.clerk?.__staffContext;
  if (!ctx) return false;
  return ctx.isOwner || ctx.permissions.has(permission);
}

function deny(res: any, permission: string): void {
  res.status(403).json({
    error: "You do not have permission to perform this action.",
    code: "INSUFFICIENT_PERMISSION",
    required: permission,
  });
}

/**
 * Commercial settings.
 *
 * Currency, tax and service charge are per organization and were read correctly
 * everywhere but could not be written by anyone, which left every venue stuck on
 * whatever the seed happened to set. This is the write path.
 *
 * Changing a rate only affects orders rung in afterwards: the rate is copied onto
 * the order when it is created, so receipts already issued keep the figures they
 * were issued with.
 */

const UpdateSettingsBody = z.object({
  name: z.string().min(1).optional(),
  currency: z
    .string()
    .length(3, "Use a three-letter currency code, e.g. KES")
    .transform((v) => v.toUpperCase())
    .optional(),
  taxRate: z
    .number()
    .int("Tax is a whole percentage")
    .min(0, "Tax cannot be negative")
    .max(100, "Tax cannot exceed 100%")
    .optional(),
  serviceChargeRate: z
    .number()
    .int("Service charge is a whole percentage")
    .min(0, "Service charge cannot be negative")
    .max(100, "Service charge cannot exceed 100%")
    .optional(),
});

router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, tenant.organizationId));

  if (!org) {
    res.status(404).json({ error: "That organization does not exist." });
    return;
  }

  const branches = await db
    .select({ id: branchesTable.id, name: branchesTable.name, city: branchesTable.city, status: branchesTable.status })
    .from(branchesTable)
    .where(eq(branchesTable.organizationId, tenant.organizationId));

  res.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    currency: org.currency,
    taxRate: org.taxRate,
    serviceChargeRate: org.serviceChargeRate,
    settings: await getTenantSettings(tenant.organizationId),
    branches,
  });
});

router.patch("/", async (req, res): Promise<void> => {
  if (!can(req, "manage_roles")) return deny(res, "manage_roles");
  const tenant = getTenant(req);

  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Nothing to change." });
    return;
  }

  const [before] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, tenant.organizationId));
  if (!before) {
    res.status(404).json({ error: "That organization does not exist." });
    return;
  }

  // The tenant settings cache is per organization and short lived; clearing it
  // means the change is in effect on the very next order rather than after a
  // wait.
  const [updated] = await db
    .update(organizationsTable)
    .set(parsed.data)
    .where(eq(organizationsTable.id, tenant.organizationId))
    .returning();

  const changes = Object.entries(parsed.data)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => `${key}: ${before[key as keyof typeof before]} → ${value}`);
  if (changes.length) {
    await logAuditEntry({
      organizationId: tenant.organizationId,
      branchId: tenant.branchId,
      staffId: tenant.staffId,
      action: "UPDATE",
      entity: "ORGANIZATION",
      entityId: tenant.organizationId,
      detail: `Commercial settings changed. ${changes.join("; ")}`,
    });
  }

  res.json({ ...updated, settings: await getTenantSettings(tenant.organizationId) });
});

/** Adds a branch. Opening a second site is a normal thing for a client to want. */
const CreateBranchBody = z.object({
  name: z.string().min(1),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  timezone: z.string().default("Africa/Nairobi"),
});

router.post("/branches", async (req, res): Promise<void> => {
  if (!can(req, "manage_branches")) return deny(res, "manage_branches");
  const tenant = getTenant(req);

  const parsed = CreateBranchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid branch." });
    return;
  }

  const [row] = await db
    .insert(branchesTable)
    .values({
      id: `branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      organizationId: tenant.organizationId,
      name: parsed.data.name,
      city: parsed.data.city ?? "",
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      timezone: parsed.data.timezone,
      status: "LIVE",
    })
    .returning();

  await logAuditEntry({
    organizationId: tenant.organizationId,
    branchId: row.id,
    staffId: tenant.staffId,
    action: "CREATE",
    entity: "BRANCH",
    entityId: row.id,
    detail: `Branch "${row.name}" created.`,
  });

  res.status(201).json(row);
});

router.patch("/branches/:branchId", async (req, res): Promise<void> => {
  if (!can(req, "manage_branches")) return deny(res, "manage_branches");
  const tenant = getTenant(req);

  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      city: z.string().optional(),
      address: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      status: z.enum(["LIVE", "CLOSED"]).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid change." });
    return;
  }

  const [existing] = await db
    .select()
    .from(branchesTable)
    .where(
      and(
        eq(branchesTable.id, req.params.branchId),
        eq(branchesTable.organizationId, tenant.organizationId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "That branch does not exist." });
    return;
  }

  const [row] = await db
    .update(branchesTable)
    .set(parsed.data)
    .where(eq(branchesTable.id, existing.id))
    .returning();

  await logAuditEntry({
    organizationId: tenant.organizationId,
    branchId: row.id,
    staffId: tenant.staffId,
    action: "UPDATE",
    entity: "BRANCH",
    entityId: row.id,
    detail: `Branch "${row.name}" updated.`,
  });

  res.json(row);
});

export default router;
