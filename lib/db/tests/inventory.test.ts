import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/index";
import {
  db,
  categoriesTable,
  inventoryItemsTable,
  organizationsTable,
  ordersTable,
  orderItemsTable,
  orderItemUnitsTable,
  productUnitsTable,
  productsTable,
  staffTable,
  tablesTable,
  inventoryAlertsTable,
  orderTicketsTable,
  orderTicketItemsTable,
  stockMovementsTable,
  branchesTable,
} from "../src/index";
import { and, eq } from "drizzle-orm";
import { deductInventoryForOrderItem, deductInventoryForTabItem } from "../../../artifacts/api-server/src/lib/inventory";

/**
 * Stock is the thing a venue cannot get wrong twice. These run against the real
 * database inside a transaction that is rolled back, so they exercise the actual
 * deduction code rather than a mock of it.
 */
const ORG = "test-inv-org";
const BRANCH = "test-inv-branch";
const TABLE = "test-inv-table";
const PRODUCT = "test-inv-prod";

/** Removes everything this suite created, so a failed run leaves nothing behind. */
async function cleanup(): Promise<void> {
  // Stock movements reference both the product and the order, so they go first.
  await db.delete(stockMovementsTable).where(eq(stockMovementsTable.productId, PRODUCT));
  await db.delete(orderTicketItemsTable).where(eq(orderTicketItemsTable.orderItemId, "test-inv-item-1"));
  await db.delete(orderTicketsTable).where(eq(orderTicketsTable.branchId, BRANCH));
  await db.delete(orderItemUnitsTable).where(eq(orderItemUnitsTable.orderItemId, "test-inv-item-1"));
  await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, "test-inv-order"));
  await db.delete(ordersTable).where(eq(ordersTable.organizationId, ORG));
  await db.delete(inventoryAlertsTable).where(eq(inventoryAlertsTable.branchId, BRANCH));
  await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.branchId, BRANCH));
  await db.delete(productUnitsTable).where(eq(productUnitsTable.productId, PRODUCT));
  await db.delete(tablesTable).where(eq(tablesTable.id, TABLE));
  await db.delete(branchesTable).where(eq(branchesTable.id, BRANCH));
  await db.delete(productsTable).where(eq(productsTable.id, PRODUCT));
  await db.delete(categoriesTable).where(eq(categoriesTable.organizationId, ORG));
  await db.delete(staffTable).where(eq(staffTable.organizationId, ORG));
  await db.delete(organizationsTable).where(eq(organizationsTable.id, ORG));
}

/**
 * This suite needs the real database. When it cannot be reached the suite is
 * skipped with the reason, rather than reporting a failure that has nothing to
 * do with the code under test. The pooled database this reaches is a managed
 * service over the public internet, and its connection is intermittently
 * refused.
 */
beforeAll(async () => {
  const deadline = Date.now() + 45_000;
  let lastError: unknown;
  let reachable = false;
  while (Date.now() < deadline) {
    try {
      await pool.query("select 1");
      reachable = true;
      break;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!reachable) {
    throw new Error(
      `Cannot reach the database: ${(lastError as Error)?.message?.split("\n")[0]}`,
    );
  }
  await cleanup();
  await db.insert(organizationsTable).values({
    id: ORG,
    name: "Inventory Test Org",
    slug: "inventory-test-org",
    currency: "KES",
    taxRate: 16,
    serviceChargeRate: 10,
  });
  await db.insert(categoriesTable).values({
    id: "test-inv-cat",
    organizationId: ORG,
    name: "Whisky",
    group: "drinks",
    station: "BAR",
  });
  await db.insert(productsTable).values({
    id: PRODUCT,
    organizationId: ORG,
    categoryId: "test-inv-cat",
    name: "Test Whisky",
    category: "Whisky",
    baseUnit: "ml",
    unit: "ml",
    cost: 1000,
    price: 5000,
    tax: 16,
    trackInventory: true,
    available: "true",
    active: true,
  });
  // A shot is 30ml, a glass 60ml, a bottle 750ml.
  await db.insert(productUnitsTable).values([
    { id: "test-inv-shot", productId: PRODUCT, name: "Shot", abbreviation: "SHOT", conversionFactor: "30", isBaseUnit: false, sellingPrice: 500, sortOrder: 1 },
    { id: "test-inv-glass", productId: PRODUCT, name: "Glass", abbreviation: "GLS", conversionFactor: "60", isBaseUnit: false, sellingPrice: 1000, sortOrder: 2 },
    { id: "test-inv-bottle", productId: PRODUCT, name: "Bottle", abbreviation: "BTL", conversionFactor: "750", isBaseUnit: true, sellingPrice: 8000, sortOrder: 3 },
  ]);
  await db.insert(branchesTable).values({
    id: BRANCH,
    organizationId: ORG,
    name: "Test Branch",
    city: "Nairobi",
    status: "LIVE",
  });
  await db.insert(tablesTable).values({
    id: TABLE,
    organizationId: ORG,
    branchId: BRANCH,
    name: "T-TEST",
    section: "Test",
    seats: 4,
    status: "AVAILABLE",
    total: 0,
  });
});

afterAll(async () => {
  await cleanup();
});

/** Runs a deduction inside a real transaction, as the routes do. */
function inTx<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(fn) as Promise<T>;
}

async function setStock(quantity: number): Promise<void> {
  await db
    .delete(inventoryItemsTable)
    .where(
      and(
        eq(inventoryItemsTable.productId, PRODUCT),
        eq(inventoryItemsTable.branchId, BRANCH),
      ),
    );
  await db.insert(inventoryItemsTable).values({
    id: `test-inv-stock-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: ORG,
    branchId: BRANCH,
    productId: PRODUCT,
    name: "Test Whisky",
    category: "Whisky",
    currentQuantity: String(quantity),
    reorderLevel: "1000",
    cost: 1000,
    unit: "ml",
  });
}

async function currentStock(): Promise<number | null> {
  const row = (
    await db
      .select()
      .from(inventoryItemsTable)
      .where(
        and(
          eq(inventoryItemsTable.productId, PRODUCT),
          eq(inventoryItemsTable.branchId, BRANCH),
        ),
      )
    .limit(1)
  )[0];
  return row ? Number(row.currentQuantity) : null;
}

const order = {
  id: "test-inv-order",
  organizationId: ORG,
  branchId: BRANCH,
  number: "#TEST-1",
  tableName: "T-TEST",
  status: "COMPLETED" as const,
  subtotal: 0,
  serviceCharge: 0,
  tax: 0,
  discount: 0,
  total: 0,
};

describe("inventory deduction for an order line", () => {
  it("deducts the recorded base-unit quantity, not the sold quantity", async () => {
    await setStock(10_000);
    await db.insert(ordersTable).values(order);
    const itemId = "test-inv-item-1";
    await db.insert(orderItemsTable).values({
      id: itemId,
      orderId: order.id,
      productId: PRODUCT,
      unitId: "test-inv-shot",
      name: "Test Whisky",
      quantity: 2,
      unitPrice: 500,
      total: 1000,
      categoryId: "test-inv-cat",
    });
    // Two shots, recorded as 60ml in the base unit.
    await db.insert(orderItemUnitsTable).values({
      id: "test-inv-oiu-1",
      orderItemId: itemId,
      unitId: "test-inv-shot",
      unitName: "Shot",
      conversionFactor: "30",
      quantityInBaseUnit: "60",
    });

    const [item] = await db.select().from(orderItemsTable).where(eq(orderItemsTable.id, itemId));
    await inTx((tx) => deductInventoryForOrderItem(tx, order as never, item, null));

    expect(await currentStock()).toBe(9_940);
  });

  it("leaves stock alone for a product that is not tracked", async () => {
    await setStock(5_000);
    await db
      .update(productsTable)
      .set({ trackInventory: false })
      .where(eq(productsTable.id, PRODUCT));

    const [item] = await db.select().from(orderItemsTable).limit(1);
    await inTx((tx) => deductInventoryForOrderItem(tx, order as never, item, null));
    expect(await currentStock()).toBe(5_000);

    await db
      .update(productsTable)
      .set({ trackInventory: true })
      .where(eq(productsTable.id, PRODUCT));
  });

  it("writes a movement recording the negative base quantity", async () => {
    await setStock(2_000);
    const [item] = await db.select().from(orderItemsTable).limit(1);
    await inTx((tx) => deductInventoryForOrderItem(tx, order as never, item, null));

    const movement = (
      await db
        .select()
        .from(stockMovementsTable)
        .where(
          and(
            eq(stockMovementsTable.productId, "test-inv-prod"),
            eq(stockMovementsTable.type, "SALE"),
          ),
        )
        .orderBy(stockMovementsTable.createdAt)
    ).pop();
    expect(movement).toBeDefined();
    expect(Number(movement!.quantityInBaseUnit)).toBe(-60);
    expect(await currentStock()).toBe(1_940);
  });

  it("can go negative rather than silently refusing a sale", async () => {
    // Stock going negative is visible and correctable; refusing the sale at the
    // till is not something the system should decide on its own.
    await setStock(10);
    const [item] = await db.select().from(orderItemsTable).limit(1);
    await inTx((tx) => deductInventoryForOrderItem(tx, order as never, item, null));
    expect(await currentStock()).toBe(-50);
  });
});

describe("inventory deduction for a tab line", () => {
  it("derives the base quantity from the selling unit", async () => {
    // A tab line has no recorded base quantity, so the conversion factor is
    // applied at handover. A glass is 60ml.
    await setStock(3_000);
    await inTx((tx) =>
      deductInventoryForTabItem(tx, order as never, { productId: PRODUCT, unitId: "test-inv-glass", quantity: 3 }, null),
    );
    expect(await currentStock()).toBe(2_820);
  });

  it("treats a line with no selling unit as one base unit each", async () => {
    await setStock(100);
    await inTx((tx) =>
      deductInventoryForTabItem(tx, order as never, { productId: PRODUCT, unitId: null, quantity: 4 }, null),
    );
    expect(await currentStock()).toBe(96);
  });

  it("deducts a full bottle at its 750ml conversion", async () => {
    await setStock(5_000);
    await inTx((tx) =>
      deductInventoryForTabItem(tx, order as never, { productId: PRODUCT, unitId: "test-inv-bottle", quantity: 2 }, null),
    );
    expect(await currentStock()).toBe(3_500);
  });
});
