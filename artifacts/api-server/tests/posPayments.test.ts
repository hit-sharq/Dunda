import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool, db } from "@workspace/db";
import { ordersTable, orderItemsTable, productsTable, categoriesTable, paymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { PaymentError, outstandingFor, recordPayment, splitSummary } from "../src/lib/billing/pos";

/**
 * A split bill, which is how a club actually settles a table.
 *
 * Several customers, several methods, one order. The invariants that matter are
 * that the total paid can never pass what was owed, and that the outstanding
 * figure is derived from the rows rather than stored and drifting.
 */

const ORG = "pos-test-org";
const BRANCH = "pos-test-branch";
const ORDER = "pos-test-order";
const CASHIER = { staffId: null, organizationId: ORG, branchId: BRANCH };
const TOTAL = 4000;

beforeAll(async () => {
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      await pool.query("select 1");
      await seed();
      return;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}, 240_000);

afterAll(async () => {
  await cleanup();
});

async function cleanup(): Promise<void> {
  await db.delete(paymentsTable).where(eq(paymentsTable.orderId, ORDER));
  await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, ORDER));
  await db.delete(ordersTable).where(eq(ordersTable.id, ORDER));
  await db.delete(productsTable).where(eq(productsTable.organizationId, ORG));
  await db.delete(categoriesTable).where(eq(categoriesTable.organizationId, ORG));
}

async function seed(): Promise<void> {
  await cleanup();
  const { organizationsTable, branchesTable } = await import("@workspace/db");
  await db
    .insert(organizationsTable)
    .values({
      id: ORG,
      name: "POS Test Org",
      slug: "pos-test-org",
      currency: "KES",
      taxRate: 16,
      serviceChargeRate: 10,
    })
    .catch(() => undefined);
  await db
    .insert(branchesTable)
    .values({
      id: BRANCH,
      organizationId: ORG,
      name: "Test Branch",
      city: "Nairobi",
      status: "LIVE",
    })
    .catch(() => undefined);
  await db.insert(categoriesTable).values({
    id: "pos-test-cat",
    organizationId: ORG,
    name: "Drinks",
    group: "drinks",
    station: "BAR",
  });
  await db.insert(productsTable).values({
    id: "pos-test-prod",
    organizationId: ORG,
    categoryId: "pos-test-cat",
    name: "Test Drink",
    category: "Drinks",
    baseUnit: "glass",
    unit: "glass",
    cost: 100,
    price: 4000,
    tax: 16,
    trackInventory: false,
    available: "true",
    active: true,
  });
  await db.insert(ordersTable).values({
    id: ORDER,
    organizationId: ORG,
    branchId: BRANCH,
    number: "#POS-TEST",
    tableName: "T1",
    status: "SERVED",
    subtotal: TOTAL,
    serviceCharge: 0,
    tax: 0,
    discount: 0,
    total: TOTAL,
  });
}

beforeEach(async () => {
  await db.delete(paymentsTable).where(eq(paymentsTable.orderId, ORDER));
  await db
    .update(ordersTable)
    .set({ status: "SERVED" })
    .where(eq(ordersTable.id, ORDER));
});

describe("split bills", () => {
  it("settles one bill across three customers and three methods", async () => {
    const result = await recordPayment(
      {
        orderId: ORDER,
        shares: [
          { method: "MPESA", amount: 1500, paidBy: "Customer A", reference: "QJG123" },
          { method: "CASH", amount: 1000, paidBy: "Customer B" },
          { method: "CARD", amount: 1500, paidBy: "Customer C" },
        ],
      },
      CASHIER,
    );

    expect(result.settled).toBe(true);
    expect(result.paid).toBe(4000);
    expect(result.outstanding).toBe(0);
    // Each share is its own row, all against the same order.
    expect(result.payments).toHaveLength(3);
    const summary = await splitSummary(ORDER);
    expect(summary.map((s) => s.paidBy).sort()).toEqual([
      "Customer A",
      "Customer B",
      "Customer C",
    ]);
    expect(summary.reduce((sum, s) => sum + s.amount, 0)).toBe(4000);
  });

  it("accepts a part payment and leaves the rest owing", async () => {
    const result = await recordPayment(
      { orderId: ORDER, shares: [{ method: "CASH", amount: 1500, paidBy: "Customer A" }] },
      CASHIER,
    );
    expect(result.settled).toBe(false);
    expect(result.outstanding).toBe(2500);
    const { outstanding } = await outstandingFor(ORDER);
    expect(outstanding).toBe(2500);
  });

  it("refuses to take more than the bill is worth", async () => {
    // Overpayment is an authorised decision, not something a till does by accident.
    await expect(
      recordPayment(
        { orderId: ORDER, shares: [{ method: "CASH", amount: TOTAL + 500 }] },
        CASHIER,
      ),
    ).rejects.toThrow(PaymentError);
  });

  it("refuses a second payment once the bill is already settled", async () => {
    await recordPayment(
      { orderId: ORDER, shares: [{ method: "CASH", amount: TOTAL }] },
      CASHIER,
    );
    await expect(
      recordPayment(
        { orderId: ORDER, shares: [{ method: "CASH", amount: 100 }] },
        CASHIER,
      ),
    ).rejects.toThrow(PaymentError);
  });

  it("settles when the last share brings it to exactly the bill", async () => {
    await recordPayment(
      { orderId: ORDER, shares: [{ method: "CASH", amount: 2500, paidBy: "A" }] },
      CASHIER,
    );
    const second = await recordPayment(
      { orderId: ORDER, shares: [{ method: "MPESA", amount: 1500, paidBy: "B" }] },
      CASHIER,
    );
    expect(second.settled).toBe(true);
    expect(second.outstanding).toBe(0);
  });

  it("will not settle a cancelled order", async () => {
    await db.update(ordersTable).set({ status: "CANCELLED" }).where(eq(ordersTable.id, ORDER));
    await expect(
      recordPayment({ orderId: ORDER, shares: [{ method: "CASH", amount: 100 }] }, CASHIER),
    ).rejects.toThrow(PaymentError);
  });

  it("ignores a payment with no amount", async () => {
    await expect(
      recordPayment({ orderId: ORDER, shares: [{ method: "CASH", amount: 0 }] }, CASHIER),
    ).rejects.toThrow();
  });

  it("will not settle an order belonging to another organization", async () => {
    await expect(
      recordPayment(
        { orderId: ORDER, shares: [{ method: "CASH", amount: 100 }] },
        { ...CASHIER, organizationId: "some-other-org" },
      ),
    ).rejects.toThrow(PaymentError);
  });
});