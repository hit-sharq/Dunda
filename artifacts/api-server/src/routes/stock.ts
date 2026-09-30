import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  auditLogsTable,
  inventoryAlertsTable,
  inventoryItemsTable,
  productsTable,
  staffTable,
  stockCountsTable,
  stockCountItemsTable,
  stockMovementsTable,
  stockTransfersTable,
  stockTransferItemsTable,
  branchesTable,
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
    error: `You do not have permission to perform this action. Required: ${permission}`,
  });
}

function num(v: string | number | null | undefined): number {
  return Number(v ?? 0);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function audit(params: {
  organizationId: string;
  branchId: string | null;
  staffId: string | null;
  action: "CREATE" | "UPDATE" | "APPROVE" | "ADJUST";
  entity: string;
  entityId?: string | null;
  detail?: string | null;
  reason?: string | null;
}): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: uid("audit"),
    organizationId: params.organizationId,
    branchId: params.branchId,
    staffId: params.staffId,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    detail: params.detail,
    reason: params.reason,
  });
}

/** Recomputes the low-stock alert for a product in a branch. */
async function syncAlert(branchId: string, productId: string, orgId: string) {
  const [stock] = await db
    .select()
    .from(inventoryItemsTable)
    .where(and(eq(inventoryItemsTable.branchId, branchId), eq(inventoryItemsTable.productId, productId)));
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));
  if (!stock || !product) return;

  const [existing] = await db
    .select()
    .from(inventoryAlertsTable)
    .where(
      and(
        eq(inventoryAlertsTable.branchId, branchId),
        eq(inventoryAlertsTable.productId, productId),
      ),
    );

  const reorder = num(stock.reorderLevel);
  const qty = num(stock.currentQuantity);

  if (qty > reorder) {
    if (existing) {
      await db.delete(inventoryAlertsTable).where(eq(inventoryAlertsTable.id, existing.id));
    }
    return;
  }

  const severity = qty <= 0 ? "OUT" : "LOW";
  if (existing) {
    await db
      .update(inventoryAlertsTable)
      .set({ stock: String(qty), minimum: String(reorder), severity, name: product.name })
      .where(eq(inventoryAlertsTable.id, existing.id));
  } else {
    await db.insert(inventoryAlertsTable).values({
      id: uid("alert"),
      organizationId: orgId,
      branchId,
      productId,
      name: product.name,
      category: product.category,
      stock: String(qty),
      minimum: String(reorder),
      unit: stock.unit,
      severity,
    });
  }
}

// ===========================================================================
// Stock transfers
// ===========================================================================

const CreateTransferBody = z.object({
  sourceBranchId: z.string().min(1),
  destinationBranchId: z.string().min(1),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
        unitId: z.string().nullable().optional(),
      }),
    )
    .min(1, "A transfer needs at least one item"),
});

router.get("/transfers", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(stockTransfersTable)
    .where(eq(stockTransfersTable.organizationId, tenant.organizationId))
    .orderBy(desc(stockTransfersTable.createdAt));

  const withItems = await Promise.all(
    rows.map(async (transfer) => ({
      ...transfer,
      items: await db
        .select()
        .from(stockTransferItemsTable)
        .where(eq(stockTransferItemsTable.transferId, transfer.id)),
    })),
  );
  res.json(withItems);
});

router.post("/transfers", async (req, res): Promise<void> => {
  if (!can(req, "adjust_inventory")) return deny(res, "adjust_inventory");
  const tenant = getTenant(req);
  const parsed = CreateTransferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  if (data.sourceBranchId === data.destinationBranchId) {
    res.status(400).json({ error: "Source and destination branches must differ" });
    return;
  }

  const branches = await db
    .select()
    .from(branchesTable)
    .where(
      and(
        inArray(branchesTable.id, [data.sourceBranchId, data.destinationBranchId]),
        eq(branchesTable.organizationId, tenant.organizationId),
      ),
    );
  if (branches.length !== 2) {
    res.status(400).json({ error: "Both branches must belong to your organization" });
    return;
  }

  const transfer = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(stockTransfersTable)
      .values({
        id: uid("transfer"),
        organizationId: tenant.organizationId,
        sourceBranchId: data.sourceBranchId,
        destinationBranchId: data.destinationBranchId,
        status: "REQUESTED",
        notes: data.notes ?? null,
      })
      .returning();

    for (const item of data.items) {
      const [stock] = await tx
        .select()
        .from(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.branchId, data.sourceBranchId),
            eq(inventoryItemsTable.productId, item.productId),
          ),
        );
      await tx.insert(stockTransferItemsTable).values({
        id: uid("ti"),
        transferId: row.id,
        productId: item.productId,
        quantity: String(item.quantity),
        quantityInBaseUnit: String(item.quantity),
      });
      if (stock && num(stock.currentQuantity) < item.quantity) {
        throw new Error(
          `Insufficient stock at the source branch for product ${item.productId}`,
        );
      }
    }
    return row;
  }).catch((err: Error) => {
    res.status(400).json({ error: err.message });
    return null;
  });

  if (!transfer) return;

  await audit({
    organizationId: tenant.organizationId,
    branchId: data.sourceBranchId,
    staffId: tenant.staffId,
    action: "CREATE",
    entity: "STOCK_TRANSFER",
    entityId: transfer.id,
    detail: `Requested ${data.items.length} item(s) from ${data.sourceBranchId} to ${data.destinationBranchId}`,
  });

  res.status(201).json(transfer);
});

router.patch("/transfers/:transferId", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = z
    .object({
      status: z.enum(["DRAFT", "REQUESTED", "APPROVED", "IN_TRANSIT", "RECEIVED", "CANCELLED"]),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const next = parsed.data.status;
  const isApproval = ["APPROVED", "IN_TRANSIT", "RECEIVED"].includes(next);
  if (isApproval && !can(req, "approve_transfer")) return deny(res, "approve_transfer");
  if (!isApproval && !can(req, "adjust_inventory")) return deny(res, "adjust_inventory");

  const [transfer] = await db
    .select()
    .from(stockTransfersTable)
    .where(
      and(
        eq(stockTransfersTable.id, req.params.transferId),
        eq(stockTransfersTable.organizationId, tenant.organizationId),
      ),
    );
  if (!transfer) {
    res.status(404).json({ error: "Transfer not found" });
    return;
  }

  const allowed: Record<string, string[]> = {
    DRAFT: ["REQUESTED", "CANCELLED"],
    REQUESTED: ["APPROVED", "CANCELLED"],
    APPROVED: ["IN_TRANSIT", "CANCELLED"],
    IN_TRANSIT: ["RECEIVED", "CANCELLED"],
    RECEIVED: [],
    CANCELLED: [],
  };
  if (!allowed[transfer.status]?.includes(next)) {
    res.status(400).json({
      error: `A transfer cannot move from ${transfer.status} to ${next}`,
    });
    return;
  }

  const [row] = await db.transaction(async (tx) => {
    // Receiving is the moment stock actually moves between branches.
    if (next === "RECEIVED") {
      const items = await tx
        .select()
        .from(stockTransferItemsTable)
        .where(eq(stockTransferItemsTable.transferId, transfer.id));

      for (const item of items) {
        const quantity = num(item.quantityInBaseUnit);
        const [source] = await tx
          .select()
          .from(inventoryItemsTable)
          .where(
            and(
              eq(inventoryItemsTable.branchId, transfer.sourceBranchId),
              eq(inventoryItemsTable.productId, item.productId),
            ),
          );
        if (source) {
          await tx
            .update(inventoryItemsTable)
            .set({ currentQuantity: String(num(source.currentQuantity) - quantity) })
            .where(eq(inventoryItemsTable.id, source.id));
        }
        await tx.insert(stockMovementsTable).values({
          id: uid("move"),
          organizationId: transfer.organizationId,
          branchId: transfer.sourceBranchId,
          productId: item.productId,
          type: "TRANSFER_OUT",
          quantity: item.quantity,
          quantityInBaseUnit: String(-quantity),
          referenceId: transfer.id,
          staffId: tenant.staffId,
        });

        const [dest] = await tx
          .select()
          .from(inventoryItemsTable)
          .where(
            and(
              eq(inventoryItemsTable.branchId, transfer.destinationBranchId),
              eq(inventoryItemsTable.productId, item.productId),
            ),
          );
        if (dest) {
          await tx
            .update(inventoryItemsTable)
            .set({ currentQuantity: String(num(dest.currentQuantity) + quantity) })
            .where(eq(inventoryItemsTable.id, dest.id));
        }
        await tx.insert(stockMovementsTable).values({
          id: uid("move"),
          organizationId: transfer.organizationId,
          branchId: transfer.destinationBranchId,
          productId: item.productId,
          type: "TRANSFER_IN",
          quantity: item.quantity,
          quantityInBaseUnit: String(quantity),
          referenceId: transfer.id,
          staffId: tenant.staffId,
        });
      }
    }

    return tx
      .update(stockTransfersTable)
      .set({
        status: next,
        approvedById: isApproval ? tenant.staffId : transfer.approvedById,
      })
      .where(eq(stockTransfersTable.id, transfer.id))
      .returning();
  });

  if (next === "RECEIVED") {
    const items = await db
      .select({ productId: stockTransferItemsTable.productId })
      .from(stockTransferItemsTable)
      .where(eq(stockTransferItemsTable.transferId, transfer.id));
    for (const item of items) {
      await syncAlert(transfer.sourceBranchId, item.productId, transfer.organizationId);
      await syncAlert(transfer.destinationBranchId, item.productId, transfer.organizationId);
    }
  }

  await audit({
    organizationId: tenant.organizationId,
    branchId: transfer.sourceBranchId,
    staffId: tenant.staffId,
    action: isApproval ? "APPROVE" : "UPDATE",
    entity: "STOCK_TRANSFER",
    entityId: transfer.id,
    detail: `${transfer.status} -> ${next}`,
  });

  res.json(row);
});

// ===========================================================================
// Stock counts
// ===========================================================================

const CreateStockCountBody = z.object({
  branchId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        actualQuantity: z.number(),
      }),
    )
    .min(1, "A stock count needs at least one line"),
});

router.get("/counts", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(stockCountsTable)
    .where(eq(stockCountsTable.organizationId, tenant.organizationId))
    .orderBy(desc(stockCountsTable.createdAt));

  const withItems = await Promise.all(
    rows.map(async (count) => ({
      ...count,
      items: await db
        .select()
        .from(stockCountItemsTable)
        .where(eq(stockCountItemsTable.stockCountId, count.id)),
    })),
  );
  res.json(withItems);
});

router.post("/counts", async (req, res): Promise<void> => {
  if (!can(req, "adjust_inventory")) return deny(res, "adjust_inventory");
  const tenant = getTenant(req);
  const parsed = CreateStockCountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const branchId = parsed.data.branchId ?? tenant.branchId;
  if (!branchId) {
    res.status(400).json({ error: "A branch is required" });
    return;
  }

  const count = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(stockCountsTable)
      .values({
        id: uid("count"),
        organizationId: tenant.organizationId,
        branchId,
        status: "DRAFT",
        notes: parsed.data.notes ?? null,
        countedById: tenant.staffId,
      })
      .returning();

    for (const item of parsed.data.items) {
      const [stock] = await tx
        .select()
        .from(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.branchId, branchId),
            eq(inventoryItemsTable.productId, item.productId),
          ),
        );
      const expected = stock ? num(stock.currentQuantity) : 0;
      await tx.insert(stockCountItemsTable).values({
        id: uid("ci"),
        stockCountId: row.id,
        productId: item.productId,
        expectedQuantity: String(expected),
        actualQuantity: String(item.actualQuantity),
        variance: String(item.actualQuantity - expected),
      });
    }
    return row;
  });

  await audit({
    organizationId: tenant.organizationId,
    branchId,
    staffId: tenant.staffId,
    action: "CREATE",
    entity: "STOCK_COUNT",
    entityId: count.id,
    detail: `Drafted a stock count of ${parsed.data.items.length} line(s)`,
  });

  res.status(201).json(count);
});

router.post("/counts/:countId/submit", async (req, res): Promise<void> => {
  if (!can(req, "adjust_inventory")) return deny(res, "adjust_inventory");
  const tenant = getTenant(req);
  const [count] = await db
    .select()
    .from(stockCountsTable)
    .where(
      and(
        eq(stockCountsTable.id, req.params.countId),
        eq(stockCountsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!count) {
    res.status(404).json({ error: "Stock count not found" });
    return;
  }
  if (count.status !== "DRAFT") {
    res.status(400).json({ error: "This stock count has already been submitted" });
    return;
  }

  const [row] = await db
    .update(stockCountsTable)
    .set({ status: "PENDING_REVIEW" })
    .where(eq(stockCountsTable.id, count.id))
    .returning();

  await audit({
    organizationId: tenant.organizationId,
    branchId: count.branchId,
    staffId: tenant.staffId,
    action: "UPDATE",
    entity: "STOCK_COUNT",
    entityId: count.id,
    detail: "Submitted for review",
  });

  res.json(row);
});

/**
 * Approving a count posts the variance. The recorded adjustment is presented as a
 * neutral inventory discrepancy: no attribution is made about its cause.
 */
router.post("/counts/:countId/approve", async (req, res): Promise<void> => {
  if (!can(req, "approve_transfer")) return deny(res, "approve_transfer");
  const tenant = getTenant(req);
  const parsed = z
    .object({ reason: z.string().nullable().optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [count] = await db
    .select()
    .from(stockCountsTable)
    .where(
      and(
        eq(stockCountsTable.id, req.params.countId),
        eq(stockCountsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!count) {
    res.status(404).json({ error: "Stock count not found" });
    return;
  }
  if (count.status !== "PENDING_REVIEW") {
    res.status(400).json({ error: "Only a submitted count can be approved" });
    return;
  }

  const items = await db
    .select()
    .from(stockCountItemsTable)
    .where(eq(stockCountItemsTable.stockCountId, count.id));

  const [row] = await db.transaction(async (tx) => {
    for (const item of items) {
      const variance = item.actualQuantity === null ? 0 : num(item.actualQuantity) - num(item.expectedQuantity);
      if (variance === 0) continue;

      const [stock] = await tx
        .select()
        .from(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.branchId, count.branchId),
            eq(inventoryItemsTable.productId, item.productId),
          ),
        );
      if (stock) {
        await tx
          .update(inventoryItemsTable)
          .set({ currentQuantity: item.actualQuantity ?? "0" })
          .where(eq(inventoryItemsTable.id, stock.id));
      }

      await tx.insert(stockMovementsTable).values({
        id: uid("move"),
        organizationId: count.organizationId,
        branchId: count.branchId,
        productId: item.productId,
        type: "STOCK_COUNT",
        quantity: item.actualQuantity ?? "0",
        quantityInBaseUnit: String(variance),
        referenceId: count.id,
        reason: parsed.data.reason ?? "Stock count variance",
        staffId: tenant.staffId,
      });
    }

    return tx
      .update(stockCountsTable)
      .set({ status: "APPROVED", approvedById: tenant.staffId })
      .where(eq(stockCountsTable.id, count.id))
      .returning();
  });

  for (const item of items) {
    await syncAlert(count.branchId, item.productId, count.organizationId);
  }

  await audit({
    organizationId: tenant.organizationId,
    branchId: count.branchId,
    staffId: tenant.staffId,
    action: "APPROVE",
    entity: "STOCK_COUNT",
    entityId: count.id,
    detail: `Approved count; ${items.filter((i) => num(i.variance) !== 0).length} discrepanc(ies) posted`,
    reason: parsed.data.reason ?? null,
  });

  res.json(row);
});

export default router;
