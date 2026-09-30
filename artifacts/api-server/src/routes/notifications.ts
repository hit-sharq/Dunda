import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { notificationsTable, staffTable } from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";

const router: IRouter = Router();

const CreateBody = z.object({
  type: z.enum([
    "ORDER_READY",
    "RESERVATION",
    "LOW_STOCK",
    "INVENTORY_DISCREPANCY",
    "APPROVAL_REQUEST",
    "STOCK_TRANSFER",
    "EVENT_REMINDER",
  ]),
  title: z.string().min(1),
  message: z.string().min(1),
  staffId: z.string().min(1),
  branchId: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
});

router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const unreadOnly = req.query.unread === "true";
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.organizationId, tenant.organizationId),
        tenant.branchId ? eq(notificationsTable.branchId, tenant.branchId) : undefined,
        unreadOnly ? eq(notificationsTable.read, "false") : undefined,
      ),
    )
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      read: r.read === "true",
      referenceId: r.referenceId,
      createdAt: r.createdAt,
    })),
  );
});

router.get("/unread-count", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.organizationId, tenant.organizationId),
        eq(notificationsTable.read, "false"),
      ),
    );
  res.json({ count: Number(row?.count ?? 0) });
});

router.post("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  // A notification may only target staff in the caller's organization.
  const [staffRow] = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.id, data.staffId));
  if (!staffRow || staffRow.organizationId !== tenant.organizationId) {
    res.status(403).json({ error: "That staff member is not in your organization" });
    return;
  }

  const [row] = await db
    .insert(notificationsTable)
    .values({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      organizationId: tenant.organizationId,
      branchId: data.branchId ?? tenant.branchId,
      staffId: data.staffId,
      type: data.type,
      title: data.title,
      message: data.message,
      read: "false",
      referenceId: data.referenceId ?? null,
    })
    .returning();

  res.status(201).json({ ...row, read: false });
});

router.patch("/:notificationId", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = z.object({ read: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(notificationsTable)
    .set({ read: parsed.data.read ? "true" : "false" })
    .where(
      and(
        eq(notificationsTable.id, req.params.notificationId),
        eq(notificationsTable.organizationId, tenant.organizationId),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json({ ...row, read: row.read === "true" });
});

router.post("/read-all", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  await db
    .update(notificationsTable)
    .set({ read: "true" })
    .where(
      and(
        eq(notificationsTable.organizationId, tenant.organizationId),
        eq(notificationsTable.read, "false"),
      ),
    );
  res.json({ ok: true });
});

export default router;
