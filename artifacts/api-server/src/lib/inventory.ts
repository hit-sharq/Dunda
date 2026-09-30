import { and, eq } from "drizzle-orm";
import {
  inventoryAlertsTable,
  inventoryItemsTable,
  orderItemsTable,
  orderItemUnitsTable,
  productUnitsTable,
  ordersTable,
  productsTable,
  stockMovementsTable,
} from "@workspace/db";
import type { StaffContext } from "./permissions";

type Order = typeof ordersTable.$inferSelect;
type OrderItem = typeof orderItemsTable.$inferSelect;

/**
 * Inventory deduction for a sold line.
 *
 * Every order item carries a recorded quantity in the product's configured base
 * unit, so the deduction is exact whether the item was sold as a piece, pack,
 * bottle, glass or shot. Deduction is driven by the station ticket being
 * served, not by the order closing, so each station is accountable for what it
 * actually handed over.
 */
export async function deductInventoryForOrderItem(
  tx: any,
  order: typeof ordersTable.$inferSelect,
  item: typeof orderItemsTable.$inferSelect,
  ctx: StaffContext | null,
): Promise<void> {
  const [unitRecord] = await tx
    .select()
    .from(orderItemUnitsTable)
    .where(eq(orderItemUnitsTable.orderItemId, item.id));
  return deductLine(tx, order, {
    productId: item.productId,
    unitId: item.unitId,
    quantity: item.quantity,
    quantityInBaseUnit: unitRecord ? Number(unitRecord.quantityInBaseUnit) : item.quantity,
    referenceId: order.id,
    ctx,
  });
}

/**
 * A tab line carries no recorded base-unit quantity, so it is derived from the
 * selling unit's conversion factor at the moment the station hands it over.
 */
export async function deductInventoryForTabItem(
  tx: any,
  order: { organizationId: string; branchId: string; id: string },
  item: { productId: string; unitId: string | null; quantity: number },
  ctx: StaffContext | null,
): Promise<void> {
  let conversion = 1;
  if (item.unitId) {
    const [unit] = await tx
      .select()
      .from(productUnitsTable)
      .where(eq(productUnitsTable.id, item.unitId));
    if (unit) conversion = Number(unit.conversionFactor);
  }
  return deductLine(tx, order as typeof ordersTable.$inferSelect, {
    productId: item.productId,
    unitId: item.unitId,
    quantity: item.quantity,
    quantityInBaseUnit: item.quantity * conversion,
    referenceId: order.id,
    ctx,
  });
}

/** Shared deduction: stock, movement, and the low-stock alert. */
async function deductLine(
  tx: any,
  order: typeof ordersTable.$inferSelect,
  line: {
    productId: string;
    unitId: string | null;
    quantity: number;
    quantityInBaseUnit: number;
    referenceId: string;
    ctx: StaffContext | null;
  },
): Promise<void> {
  const item = line;
  const quantityInBaseUnit = line.quantityInBaseUnit;
  {
    const [product] = await tx
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));
    if (!product?.trackInventory) return;

    const [stock] = await tx
      .select()
      .from(inventoryItemsTable)
      .where(
        and(
          eq(inventoryItemsTable.productId, product.id),
          eq(inventoryItemsTable.branchId, order.branchId),
        ),
      );

    let currentQuantity = quantityInBaseUnit;
    if (stock) {
      currentQuantity = Number(stock.currentQuantity) - quantityInBaseUnit;
      await tx
        .update(inventoryItemsTable)
        .set({ currentQuantity: String(currentQuantity) })
        .where(eq(inventoryItemsTable.id, stock.id));
    } else {
      await tx.insert(inventoryItemsTable).values({
        id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        organizationId: order.organizationId,
        branchId: order.branchId,
        productId: product.id,
        name: product.name,
        category: product.category,
        sku: product.sku,
        currentQuantity: String(-quantityInBaseUnit),
        reorderLevel: "0",
        cost: product.cost,
        unit: product.baseUnit,
      });
    }

    await tx.insert(stockMovementsTable).values({
      id: `move-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      organizationId: order.organizationId,
      branchId: order.branchId,
      productId: product.id,
      type: "SALE",
      quantity: String(item.quantity),
      quantityInBaseUnit: String(-quantityInBaseUnit),
      unitId: item.unitId,
      referenceId: item.referenceId,
      reason: null,
      staffId: line.ctx?.staffId ?? null,
    });

    // Keep low-stock alerts in step with the deduction.
    if (stock) {
      const existingAlert = await tx
        .select()
        .from(inventoryAlertsTable)
        .where(
          and(
            eq(inventoryAlertsTable.productId, product.id),
            eq(inventoryAlertsTable.branchId, order.branchId),
          ),
        );
      const reorderLevel = Number(stock.reorderLevel);
      const severity = currentQuantity <= 0 ? "OUT" : "LOW";
      if (currentQuantity <= reorderLevel) {
        if (existingAlert[0]) {
          await tx
            .update(inventoryAlertsTable)
            .set({ stock: String(currentQuantity), severity })
            .where(eq(inventoryAlertsTable.id, existingAlert[0].id));
        } else {
          await tx.insert(inventoryAlertsTable).values({
            id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            organizationId: order.organizationId,
            branchId: order.branchId,
            productId: product.id,
            name: product.name,
            category: product.category,
            stock: String(currentQuantity),
            minimum: String(reorderLevel),
            unit: product.baseUnit,
            severity,
          });
        }
      } else if (existingAlert[0]) {
        await tx
          .delete(inventoryAlertsTable)
          .where(eq(inventoryAlertsTable.id, existingAlert[0].id));
      }
    }
  }
}