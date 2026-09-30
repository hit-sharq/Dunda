import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  auditLogsTable,
  branchesTable,
  floorSectionsTable,
  floorsTable,
  tablesTable,
  tabsTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
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

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function audit(
  organizationId: string,
  branchId: string | null,
  staffId: string | null,
  action: "CREATE" | "UPDATE" | "DELETE",
  entity: string,
  entityId: string,
  detail: string,
): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: uid("audit"),
    organizationId,
    branchId,
    staffId,
    action,
    entity,
    entityId,
    detail,
  });
}

/** Confirms the branch belongs to the caller's organization. */
async function assertBranch(organizationId: string, branchId: string) {
  const [branch] = await db
    .select()
    .from(branchesTable)
    .where(and(eq(branchesTable.id, branchId), eq(branchesTable.organizationId, organizationId)));
  return branch ?? null;
}

const CreateFloorBody = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

const CreateSectionBody = z.object({
  name: z.string().min(1),
  color: z.string().default("#f07a4b"),
  sortOrder: z.number().int().default(0),
});

const CreateTableBody = z.object({
  name: z.string().min(1),
  section: z.string().min(1),
  floorSectionId: z.string().nullable().optional(),
  seats: z.number().int().min(1).default(4),
  x: z.number().int().default(0),
  y: z.number().int().default(0),
  width: z.number().int().min(40).default(150),
  height: z.number().int().min(40).default(150),
});

const UpdateTableBody = CreateTableBody.partial().extend({
  status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "PAYMENT_PENDING", "CLEANING"]).optional(),
});

// --- Floors -----------------------------------------------------------------

router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const branchId = String(req.query.branchId ?? tenant.branchId ?? "");
  if (!branchId) {
    res.status(400).json({ error: "A branch is required" });
    return;
  }
  if (!(await assertBranch(tenant.organizationId, branchId))) {
    res.status(404).json({ error: "Branch not found" });
    return;
  }

  const floors = await db
    .select()
    .from(floorsTable)
    .where(eq(floorsTable.branchId, branchId))
    .orderBy(floorsTable.sortOrder);

  const sections = floors.length
    ? await db.select().from(floorSectionsTable)
    : [];

  res.json({
    branchId,
    floors: floors.map((floor) => ({
      id: floor.id,
      name: floor.name,
      sortOrder: floor.sortOrder,
      sections: sections
        .filter((s) => s.floorId === floor.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ id: s.id, name: s.name, color: s.color, sortOrder: s.sortOrder })),
    })),
  });
});

router.post("/", async (req, res): Promise<void> => {
  if (!can(req, "manage_floor")) return deny(res, "manage_floor");
  const tenant = getTenant(req);
  const parsed = CreateFloorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const branchId = String(req.body.branchId ?? tenant.branchId ?? "");
  if (!(await assertBranch(tenant.organizationId, branchId))) {
    res.status(404).json({ error: "Branch not found" });
    return;
  }

  const [row] = await db
    .insert(floorsTable)
    .values({
      id: uid("floor"),
      branchId,
      name: parsed.data.name,
      sortOrder: parsed.data.sortOrder,
    })
    .returning();

  await audit(
    tenant.organizationId,
    branchId,
    tenant.staffId,
    "CREATE",
    "FLOOR",
    row.id,
    `Created floor ${row.name}`,
  );
  res.status(201).json(row);
});

router.patch("/:floorId", async (req, res): Promise<void> => {
  if (!can(req, "manage_floor")) return deny(res, "manage_floor");
  const tenant = getTenant(req);
  const parsed = CreateFloorBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(floorsTable)
    .set({ name: parsed.data.name, sortOrder: parsed.data.sortOrder })
    .where(eq(floorsTable.id, req.params.floorId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Floor not found" });
    return;
  }
  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "UPDATE",
    "FLOOR",
    row.id,
    `Updated floor ${row.name}`,
  );
  res.json(row);
});

router.delete("/:floorId", async (req, res): Promise<void> => {
  if (!can(req, "manage_floor")) return deny(res, "manage_floor");
  const tenant = getTenant(req);
  const [floor] = await db.select().from(floorsTable).where(eq(floorsTable.id, req.params.floorId));
  if (!floor) {
    res.status(404).json({ error: "Floor not found" });
    return;
  }
  if (!(await assertBranch(tenant.organizationId, floor.branchId))) {
    res.status(403).json({ error: "That floor belongs to another organization" });
    return;
  }

  const occupied = await db
    .select({ id: tablesTable.id })
    .from(tablesTable)
    .where(and(eq(tablesTable.floorId, floor.id), eq(tablesTable.status, "OCCUPIED")));
  if (occupied.length) {
    res.status(409).json({ error: "Close the occupied tables before deleting this floor" });
    return;
  }

  await db.delete(floorSectionsTable).where(eq(floorSectionsTable.floorId, floor.id));
  await db.delete(tablesTable).where(eq(tablesTable.floorId, floor.id));
  await db.delete(floorsTable).where(eq(floorsTable.id, floor.id));

  await audit(
    tenant.organizationId,
    floor.branchId,
    tenant.staffId,
    "DELETE",
    "FLOOR",
    floor.id,
    `Deleted floor ${floor.name}`,
  );
  res.status(204).send();
});

// --- Sections ---------------------------------------------------------------

router.post("/:floorId/sections", async (req, res): Promise<void> => {
  if (!can(req, "manage_floor")) return deny(res, "manage_floor");
  const tenant = getTenant(req);
  const parsed = CreateSectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [floor] = await db.select().from(floorsTable).where(eq(floorsTable.id, req.params.floorId));
  if (!floor) {
    res.status(404).json({ error: "Floor not found" });
    return;
  }
  if (!(await assertBranch(tenant.organizationId, floor.branchId))) {
    res.status(403).json({ error: "That floor belongs to another organization" });
    return;
  }

  const [row] = await db
    .insert(floorSectionsTable)
    .values({
      id: uid("sec"),
      floorId: floor.id,
      name: parsed.data.name,
      color: parsed.data.color,
      sortOrder: parsed.data.sortOrder,
    })
    .returning();

  await audit(
    tenant.organizationId,
    floor.branchId,
    tenant.staffId,
    "CREATE",
    "FLOOR_SECTION",
    row.id,
    `Created section ${row.name} on ${floor.name}`,
  );
  res.status(201).json(row);
});

router.patch("/sections/:sectionId", async (req, res): Promise<void> => {
  if (!can(req, "manage_floor")) return deny(res, "manage_floor");
  const tenant = getTenant(req);
  const parsed = CreateSectionBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [section] = await db
    .select()
    .from(floorSectionsTable)
    .where(eq(floorSectionsTable.id, req.params.sectionId));
  if (!section) {
    res.status(404).json({ error: "Section not found" });
    return;
  }
  const [row] = await db
    .update(floorSectionsTable)
    .set({ name: parsed.data.name, color: parsed.data.color, sortOrder: parsed.data.sortOrder })
    .where(eq(floorSectionsTable.id, section.id))
    .returning();

  // Keep the denormalized section label on tables consistent.
  if (parsed.data.name) {
    await db
      .update(tablesTable)
      .set({ section: parsed.data.name })
      .where(eq(tablesTable.floorSectionId, section.id));
  }

  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "UPDATE",
    "FLOOR_SECTION",
    row!.id,
    `Updated section ${row!.name}`,
  );
  res.json(row);
});

router.delete("/sections/:sectionId", async (req, res): Promise<void> => {
  if (!can(req, "manage_floor")) return deny(res, "manage_floor");
  const tenant = getTenant(req);
  const [section] = await db
    .select()
    .from(floorSectionsTable)
    .where(eq(floorSectionsTable.id, req.params.sectionId));
  if (!section) {
    res.status(404).json({ error: "Section not found" });
    return;
  }
  await db.delete(tablesTable).where(eq(tablesTable.floorSectionId, section.id));
  await db.delete(floorSectionsTable).where(eq(floorSectionsTable.id, section.id));
  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "DELETE",
    "FLOOR_SECTION",
    section.id,
    `Deleted section ${section.name}`,
  );
  res.status(204).send();
});

// --- Tables -----------------------------------------------------------------

router.get("/tables", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const branchId = String(req.query.branchId ?? tenant.branchId ?? "");
  if (!branchId) {
    res.status(400).json({ error: "A branch is required" });
    return;
  }
  if (!(await assertBranch(tenant.organizationId, branchId))) {
    res.status(404).json({ error: "Branch not found" });
    return;
  }
  const rows = await db
    .select()
    .from(tablesTable)
    .where(
      and(
        eq(tablesTable.branchId, branchId),
        eq(tablesTable.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(tablesTable.section, tablesTable.name);
  res.json(rows);
});

router.post("/tables", async (req, res): Promise<void> => {
  if (!can(req, "manage_floor")) return deny(res, "manage_floor");
  const tenant = getTenant(req);
  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const branchId = String(req.body.branchId ?? tenant.branchId ?? "");
  if (!(await assertBranch(tenant.organizationId, branchId))) {
    res.status(404).json({ error: "Branch not found" });
    return;
  }

  const [row] = await db
    .insert(tablesTable)
    .values({
      id: uid("table"),
      organizationId: tenant.organizationId,
      branchId,
      floorId: req.body.floorId ?? null,
      floorSectionId: parsed.data.floorSectionId ?? null,
      name: parsed.data.name,
      section: parsed.data.section,
      seats: parsed.data.seats,
      status: "AVAILABLE",
      total: 0,
      x: parsed.data.x,
      y: parsed.data.y,
      width: parsed.data.width,
      height: parsed.data.height,
    })
    .returning();

  await db
    .update(branchesTable)
    .set({
      totalTables: sql`(select count(*)::int from ${tablesTable} where ${tablesTable.branchId} = ${branchId})`,
    })
    .where(eq(branchesTable.id, branchId));

  await audit(
    tenant.organizationId,
    branchId,
    tenant.staffId,
    "CREATE",
    "TABLE",
    row.id,
    `Created table ${row.name} (${row.seats} seats)`,
  );
  res.status(201).json(row);
});

router.patch("/tables/:tableId", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = UpdateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(tablesTable)
    .where(
      and(
        eq(tablesTable.id, req.params.tableId),
        eq(tablesTable.organizationId, tenant.organizationId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Table not found" });
    return;
  }

  // Layout edits need the floor permission; status changes are operational and
  // available to floor staff.
  const layoutChange =
    parsed.data.name !== undefined ||
    parsed.data.section !== undefined ||
    parsed.data.seats !== undefined ||
    parsed.data.x !== undefined ||
    parsed.data.y !== undefined ||
    parsed.data.width !== undefined ||
    parsed.data.height !== undefined;
  if (layoutChange && !can(req, "manage_floor")) return deny(res, "manage_floor");

  if (parsed.data.status && existing.status !== parsed.data.status && existing.tabId) {
    if (existing.status === "OCCUPIED" && parsed.data.status === "AVAILABLE") {
      res.status(409).json({ error: "Close the open tab before releasing this table" });
      return;
    }
  }

  const [row] = await db
    .update(tablesTable)
    .set({
      name: parsed.data.name,
      section: parsed.data.section,
      floorSectionId: parsed.data.floorSectionId,
      seats: parsed.data.seats,
      x: parsed.data.x,
      y: parsed.data.y,
      width: parsed.data.width,
      height: parsed.data.height,
      status: parsed.data.status,
    })
    .where(eq(tablesTable.id, existing.id))
    .returning();

  if (parsed.data.status && parsed.data.status !== existing.status) {
    await db
      .update(branchesTable)
      .set({
        activeTables: sql`(select count(*)::int from ${tablesTable} where ${tablesTable.branchId} = ${existing.branchId} and ${tablesTable.status} = 'OCCUPIED')`,
      })
      .where(eq(branchesTable.id, existing.branchId));
  }

  await audit(
    tenant.organizationId,
    existing.branchId,
    tenant.staffId,
    "UPDATE",
    "TABLE",
    row!.id,
    layoutChange
      ? `Updated table layout for ${row!.name}`
      : `Table ${row!.name}: ${existing.status} -> ${parsed.data.status}`,
  );
  res.json(row);
});

router.delete("/tables/:tableId", async (req, res): Promise<void> => {
  if (!can(req, "manage_floor")) return deny(res, "manage_floor");
  const tenant = getTenant(req);
  const [existing] = await db
    .select()
    .from(tablesTable)
    .where(
      and(
        eq(tablesTable.id, req.params.tableId),
        eq(tablesTable.organizationId, tenant.organizationId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Table not found" });
    return;
  }
  if (existing.status === "OCCUPIED" || existing.tabId) {
    res.status(409).json({ error: "Close the open tab before deleting this table" });
    return;
  }

  await db.delete(tablesTable).where(eq(tablesTable.id, existing.id));
  await db
    .update(branchesTable)
    .set({
      totalTables: sql`(select count(*)::int from ${tablesTable} where ${tablesTable.branchId} = ${existing.branchId})`,
    })
    .where(eq(branchesTable.id, existing.branchId));

  await audit(
    tenant.organizationId,
    existing.branchId,
    tenant.staffId,
    "DELETE",
    "TABLE",
    existing.id,
    `Deleted table ${existing.name}`,
  );
  res.status(204).send();
});

export default router;
