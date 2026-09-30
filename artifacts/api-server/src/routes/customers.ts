import { Router, type IRouter } from "express";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import {
  CreateCustomerBody,
  CreateCustomerResponse,
  GetCustomerParams,
  GetCustomerResponse,
  GetCustomersQueryParams,
  GetCustomersResponse,
  GetCustomersResponseItem,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { customersTable } from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import { logAuditEntry } from "../lib/auditLogger";

const router: IRouter = Router();

router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetCustomersQueryParams.parse(req.query);
  const searchClause = params.search
    ? or(
        ilike(customersTable.name, `%${params.search}%`),
        ilike(customersTable.phone, `%${params.search}%`),
      )
    : undefined;
  const rows = await db
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.organizationId, tenant.organizationId),
        searchClause,
      ),
    )
    .orderBy(customersTable.name);
  const response = rows.map((row) =>
    GetCustomersResponseItem.parse({
      id: row.id,
      name: row.name,
      phone: row.phone ?? null,
      email: row.email ?? null,
      vipLevel: row.vipLevel as
        | "NONE"
        | "BRONZE"
        | "SILVER"
        | "GOLD"
        | "PLATINUM",
      totalVisits: row.totalVisits,
      totalSpend: row.totalSpend,
      lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
      notes: row.notes ?? null,
      createdAt: row.createdAt,
    }),
  );
  res.json(GetCustomersResponse.parse(response));
});

router.post("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = `cust-${Date.now()}`;
  const [row] = await db
    .insert(customersTable)
    .values({
      id,
      organizationId: tenant.organizationId,
      branchId: tenant.branchId ?? null,
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      vipLevel: "NONE",
      notes: parsed.data.notes ?? null,
    })
    .returning();
  res.status(201).json(
    CreateCustomerResponse.parse({
      id: row.id,
      name: row.name,
      phone: row.phone ?? null,
      email: row.email ?? null,
      vipLevel: row.vipLevel as
        | "NONE"
        | "BRONZE"
        | "SILVER"
        | "GOLD"
        | "PLATINUM",
      totalVisits: row.totalVisits,
      totalSpend: row.totalSpend,
      lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
      notes: row.notes ?? null,
      createdAt: row.createdAt,
    }),
  );
});

router.get("/:customerId", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, params.data.customerId),
        eq(customersTable.organizationId, tenant.organizationId),
      ),
    );
  if (!row) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(
    GetCustomerResponse.parse({
      id: row.id,
      name: row.name,
      phone: row.phone ?? null,
      email: row.email ?? null,
      vipLevel: row.vipLevel as
        | "NONE"
        | "BRONZE"
        | "SILVER"
        | "GOLD"
        | "PLATINUM",
      totalVisits: row.totalVisits,
      totalSpend: row.totalSpend,
      lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
      notes: row.notes ?? null,
      createdAt: row.createdAt,
    }),
  );
});

router.patch("/:customerId", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      vipLevel: z.enum(["NONE", "BRONZE", "SILVER", "GOLD", "PLATINUM"]).optional(),
      notes: z.string().nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, req.params.customerId),
        eq(customersTable.organizationId, tenant.organizationId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  // VIP status is a sensitive change.
  if (parsed.data.vipLevel && parsed.data.vipLevel !== existing.vipLevel) {
    const ctx = req.clerk?.__staffContext as
      | { isOwner: boolean; permissions: Set<string> }
      | undefined;
    if (!ctx || (!ctx.isOwner && !ctx.permissions.has("manage_vip"))) {
      res.status(403).json({
        error: "You do not have permission to perform this action.",
        code: "INSUFFICIENT_PERMISSION",
        required: "manage_vip",
      });
      return;
    }
  }

  const [row] = await db
    .update(customersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(customersTable.id, existing.id))
    .returning();

  await logAuditEntry({
    organizationId: tenant.organizationId,
    branchId: tenant.branchId,
    staffId: tenant.staffId,
    action: "UPDATE",
    entity: "CUSTOMER",
    entityId: row.id,
    detail: parsed.data.vipLevel
      ? `Updated ${row.name}; VIP level ${existing.vipLevel} -> ${row.vipLevel}`
      : `Updated ${row.name}`,
  });

  res.json(
    GetCustomerResponse.parse({
      id: row.id,
      name: row.name,
      phone: row.phone ?? null,
      email: row.email ?? null,
      vipLevel: row.vipLevel as
        | "NONE"
        | "BRONZE"
        | "SILVER"
        | "GOLD"
        | "PLATINUM",
      totalVisits: row.totalVisits,
      totalSpend: row.totalSpend,
      lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
      notes: row.notes ?? null,
      createdAt: row.createdAt,
    }),
  );
});

export default router;
