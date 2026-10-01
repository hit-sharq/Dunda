import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { signInAs, signOut } from "./support/auth";
import { pool, db } from "@workspace/db";
import {
  branchesTable,
  organizationsTable,
  categoriesTable,
  inventoryAlertsTable,
  inventoryItemsTable,
  organizationMembersTable,
  branchMembersTable,
  ordersTable,
  orderItemsTable,
  orderTicketsTable,
  orderTicketItemsTable,
  productsTable,
  rolesTable,
  productUnitsTable,
  staffTable,
  stockMovementsTable,
  tablesTable,
  tabsTable,
  tabItemsTable,
  auditLogsTable,
  setupTokensTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import app from "../src/app";

/**
 * The route layer, exercised through real HTTP.
 *
 * Everything below the identity check runs for real: the tenant resolution, the
 * permission boundary, the transactions and the database writes. Only the Clerk
 * token check is stubbed, because that is the one part that needs a real
 * identity provider to be meaningful.
 */

const ORG = "rt-org";
const BRANCH = "rt-branch";
const OWNER_CLERK = "user_rt_owner";
const MANAGER_CLERK = "user_rt_manager";
const WAITER_CLERK = "user_rt_waiter";
const OUTSIDER_CLERK = "user_rt_outsider";
const OTHER_ORG = "rt-other-org";
const OTHER_BRANCH = "rt-other-branch";
// Role ids differ between a fresh seed and a database that adopted an existing
// role during the catalogue reconciliation, so they are resolved by name.
let OWNER_ROLE = "";
let MANAGER_ROLE = "";
let WAITER_ROLE = "";

beforeAll(async () => {
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      await pool.query("select 1");
      await seed();
      return;
    } catch (err) {
      if (Date.now() > deadline) {
        throw new Error(
          `Could not prepare the database: ${(err as Error)?.message?.split("\n")[0]}`,
        );
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}, 240_000);

afterAll(async () => {
  await cleanup();
});

/**
 * Removes everything this suite created.
 *
 * Audit rows are written during the tests themselves, so cleanup has to run
 * before the staff rows it references, and has to tolerate the case where a
 * previous run already removed some of it.
 */
async function cleanup(): Promise<void> {
  for (const orgId of [ORG, OTHER_ORG]) {
    for (const table of [
      auditLogsTable,
      stockMovementsTable,
      inventoryAlertsTable,
      inventoryItemsTable,
      orderTicketItemsTable,
      orderTicketsTable,
      orderItemsTable,
      ordersTable,
      tabItemsTable,
      tabsTable,
      organizationMembersTable,
      branchMembersTable,
      staffTable,
      tablesTable,
    ]) {
      try {
        if (table === orderItemsTable) {
          await db.delete(table).where(
            inArray(
              orderItemsTable.orderId,
              db
                .select({ id: ordersTable.id })
                .from(ordersTable)
                .where(eq(ordersTable.organizationId, orgId)),
            ),
          );
          continue;
        }
        if (table === tabsTable) {
          await db.delete(tabItemsTable).where(
            inArray(
              tabItemsTable.tabId,
              db
                .select({ id: tabsTable.id })
                .from(tabsTable)
                .where(eq(tabsTable.organizationId, orgId)),
            ),
          );
        }
        await db.delete(table).where(eq((table as any).organizationId, orgId));
      } catch (err) {
        // A relation this suite never created may be missing; that is fine.
        if (!/violates foreign key|does not exist/.test((err as Error)?.message ?? "")) {
          throw err;
        }
      }
    }
    await db
      .delete(productUnitsTable)
      .where(
        inArray(
          productUnitsTable.productId,
          db
            .select({ id: productsTable.id })
            .from(productsTable)
            .where(eq(productsTable.organizationId, orgId)),
        ),
      );
    await db.delete(productsTable).where(eq(productsTable.organizationId, orgId));
    await db.delete(categoriesTable).where(eq(categoriesTable.organizationId, orgId));
    await db.delete(branchesTable).where(eq(branchesTable.organizationId, orgId));
    await db.delete(setupTokensTable).where(eq(setupTokensTable.organizationId, orgId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  }
}

async function seed(): Promise<void> {
  await cleanup();
  for (const [id, name, slug] of [
    [ORG, "Route Test Org", "route-test-org"],
    [OTHER_ORG, "Other Org", "rt-other-org"],
  ] as const) {
    await db.insert(organizationsTable).values({
      id,
      name,
      slug,
      currency: "KES",
      taxRate: 16,
      serviceChargeRate: 10,
    });
    await db.insert(branchesTable).values({
      id: id === ORG ? BRANCH : OTHER_BRANCH,
      organizationId: id,
      name: "Test Branch",
      city: "Nairobi",
      status: "LIVE",
    });
    await db.insert(tablesTable).values({
      id: `${id}-table`,
      organizationId: id,
      branchId: id === ORG ? BRANCH : OTHER_BRANCH,
      name: "T1",
      section: "Main",
      seats: 4,
      status: "AVAILABLE",
      total: 0,
    });
  }
  await db.insert(categoriesTable).values([
    { id: `${ORG}-cat`, organizationId: ORG, name: "Drinks", group: "drinks", station: "BAR" },
    { id: `${ORG}-food`, organizationId: ORG, name: "Food", group: "food", station: "KITCHEN" },
  ]);
  await db.insert(productsTable).values([
    {
      id: `${ORG}-drink`,
      organizationId: ORG,
      categoryId: `${ORG}-cat`,
      name: "Test Whisky",
      category: "Drinks",
      baseUnit: "ml",
      unit: "ml",
      cost: 1000,
      price: 5000,
      tax: 16,
      trackInventory: true,
      available: "true",
      active: true,
    },
    {
      id: `${ORG}-food`,
      organizationId: ORG,
      categoryId: `${ORG}-food`,
      name: "Test Steak",
      category: "Food",
      baseUnit: "plate",
      unit: "plate",
      cost: 500,
      price: 1500,
      tax: 16,
      trackInventory: true,
      available: "true",
      active: true,
    },
  ]);
  await db.insert(productUnitsTable).values([
    { id: `${ORG}-shot`, productId: `${ORG}-drink`, name: "Shot", abbreviation: "SHOT", conversionFactor: "30", isBaseUnit: false, sellingPrice: 500, sortOrder: 1 },
    { id: `${ORG}-bottle`, productId: `${ORG}-drink`, name: "Bottle", abbreviation: "BTL", conversionFactor: "750", isBaseUnit: true, sellingPrice: 8000, sortOrder: 2 },
  ]);
  await db.insert(inventoryItemsTable).values([
    { id: `${ORG}-inv-drink`, organizationId: ORG, branchId: BRANCH, productId: `${ORG}-drink`, name: "Test Whisky", category: "Drinks", currentQuantity: "10000", reorderLevel: "1000", cost: 1000, unit: "ml" },
    { id: `${ORG}-inv-food`, organizationId: ORG, branchId: BRANCH, productId: `${ORG}-food`, name: "Test Steak", category: "Food", currentQuantity: "50", reorderLevel: "10", cost: 500, unit: "plate" },
  ]);
  const roleByName = async (name: string): Promise<string> => {
    const row = (
      await db.select().from(rolesTable).where(eq(rolesTable.name, name)).limit(1)
    )[0];
    if (!row) throw new Error(`This database has no "${name}" role`);
    return row.id;
  };
  OWNER_ROLE = await roleByName("Organization Owner");
  MANAGER_ROLE = await roleByName("Branch Manager");
  WAITER_ROLE = await roleByName("Waiter");

  await db.insert(staffTable).values([
    { id: "rt-owner", organizationId: ORG, branchId: BRANCH, clerkUserId: OWNER_CLERK, name: "Route Owner", email: "owner@rt.test", roleId: OWNER_ROLE, status: "ACTIVE" },
    { id: "rt-manager", organizationId: ORG, branchId: BRANCH, clerkUserId: MANAGER_CLERK, name: "Route Manager", email: "manager@rt.test", roleId: MANAGER_ROLE, status: "ACTIVE" },
    { id: "rt-waiter", organizationId: ORG, branchId: BRANCH, clerkUserId: WAITER_CLERK, name: "Route Waiter", email: "waiter@rt.test", roleId: WAITER_ROLE, status: "ACTIVE" },
    { id: "rt-outsider", organizationId: OTHER_ORG, branchId: OTHER_BRANCH, clerkUserId: OUTSIDER_CLERK, name: "Outsider", email: "out@rt.test", roleId: OWNER_ROLE, status: "ACTIVE" },
  ]);
  for (const [id, clerk, role] of [
    ["rt-owner", OWNER_CLERK, OWNER_ROLE],
    ["rt-manager", MANAGER_CLERK, MANAGER_ROLE],
    ["rt-waiter", WAITER_CLERK, WAITER_ROLE],
  ] as const) {
    await db.insert(organizationMembersTable).values({
      id: `om-${id}`,
      organizationId: ORG,
      clerkUserId: clerk,
      roleId: role,
    });
    await db.insert(branchMembersTable).values({
      id: `bm-${id}`,
      organizationId: ORG,
      branchId: BRANCH,
      clerkUserId: clerk,
      roleId: role,
    });
  }
}

async function resetTable(): Promise<void> {
  await db
    .update(tablesTable)
    .set({ status: "AVAILABLE", tabId: null, customer: null, total: 0 })
    .where(eq(tablesTable.id, `${ORG}-table`));
}

beforeEach(() => {
  signOut();
});

// An unhandled route failure is a 500 with no body, so the failing responses
// are captured here to make the underlying error visible while diagnosing.


describe("authentication", () => {
  it("refuses an unauthenticated request", async () => {
    const res = await request(app).get("/api/branches");
    expect(res.status).toBe(401);
  });

  it("refuses an account that belongs to no organization", async () => {
    signInAs("user_with_no_staff_record");
    const res = await request(app).get("/api/branches");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("STAFF_RECORD_REQUIRED");
  });
});

describe("tenancy", () => {
  it("scopes a list to the caller's own organization", async () => {
    signInAs(OWNER_CLERK);
    const res = await request(app).get("/api/branches");
    expect(res.status).toBe(200);
    const names = res.body.map((b: { name: string }) => b.name);
    expect(names).toContain("Test Branch");
    // Two organizations exist, but only this caller's branch may be listed.
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(BRANCH);
  });
});

describe("the role grant boundary, over HTTP", () => {
  it("lets an owner add somebody", async () => {
    signInAs(OWNER_CLERK);
    const res = await request(app).post("/api/staff").send({
      name: "New Hire",
      email: `newhire-${Date.now()}@rt.test`,
      roleId: WAITER_ROLE,
      branchId: BRANCH,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("New Hire");
  });

  it("refuses a manager handing out the owner role", async () => {
    signInAs(MANAGER_CLERK);
    const res = await request(app).post("/api/staff").send({
      name: "Escalation Attempt",
      email: "escalate@rt.test",
      roleId: OWNER_ROLE,
      branchId: BRANCH,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CANNOT_GRANT_ROLE");
  });

  it("lets a manager add an ordinary role", async () => {
    signInAs(MANAGER_CLERK);
    const res = await request(app).post("/api/staff").send({
      name: "Manager Hire",
      email: `mgr-${Date.now()}@rt.test`,
      roleId: WAITER_ROLE,
      branchId: BRANCH,
    });
    expect(res.status).toBe(201);
  });

  it("refuses a waiter managing staff at all", async () => {
    signInAs(WAITER_CLERK);
    const res = await request(app).post("/api/staff").send({
      name: "Waiter Hire",
      email: "waiterhire@rt.test",
      roleId: WAITER_ROLE,
    });
    expect(res.status).toBe(403);
  });

  it("refuses a waiter taking payment", async () => {
    signInAs(WAITER_CLERK);
    const res = await request(app).post("/api/payments").send({
      orderId: "anything",
      amount: 100,
      method: "CASH",
    });
    expect(res.status).toBe(403);
  });

  it("refuses a second owner", async () => {
    signInAs(OWNER_CLERK);
    const res = await request(app).post("/api/staff").send({
      name: "Second Owner",
      email: "second-owner@rt.test",
      roleId: OWNER_ROLE,
      branchId: BRANCH,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OWNER_ALREADY_EXISTS");
  });
});

describe("tables and double booking", () => {
  it("refuses to open a second tab on an occupied table", async () => {
    await db
      .update(tablesTable)
      .set({ status: "AVAILABLE", tabId: null, customer: null })
      .where(eq(tablesTable.id, `${ORG}-table`));

    signInAs(WAITER_CLERK);
    const first = await request(app).post("/api/tabs").send({
      customer: "First",
      table: "T1",
      tableId: `${ORG}-table`,
    });
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/tabs").send({
      customer: "Second",
      table: "T1",
      tableId: `${ORG}-table`,
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("TABLE_NOT_AVAILABLE");
  });

  it("refuses an order against a table that is not free", async () => {
    signInAs(WAITER_CLERK);
    const res = await request(app).post("/api/orders").send({
      table: "T1",
      tableId: `${ORG}-table`,
      items: [{ productId: `${ORG}-drink`, quantity: 1 }],
    });
    // The table is still occupied by the previous test.
    expect(res.status).toBe(409);
  });

  it("refuses a table that does not exist in this organization", async () => {
    signInAs(WAITER_CLERK);
    const res = await request(app).post("/api/orders").send({
      table: "Ghost",
      tableId: "does-not-exist",
      items: [{ productId: `${ORG}-drink`, quantity: 1 }],
    });
    expect(res.status).toBe(404);
  });
});

describe("orders, station tickets and checkout", () => {
  it("splits a mixed order across the bar and the kitchen", async () => {
    await db
      .update(tablesTable)
      .set({ status: "AVAILABLE", tabId: null, customer: null })
      .where(eq(tablesTable.id, `${ORG}-table`));
    signInAs(WAITER_CLERK);

    const created = await request(app).post("/api/orders").send({
      table: "T1",
      tableId: `${ORG}-table`,
      items: [
        { productId: `${ORG}-drink`, quantity: 2, unitId: `${ORG}-shot` },
        { productId: `${ORG}-food`, quantity: 1 },
      ],
    });
    expect(created.status).toBe(201);
    const orderId = created.body.id;

    signInAs(OWNER_CLERK);
    const bar = await request(app)
      .get("/api/tickets")
      .query({ station: "BAR" });
    const kitchen = await request(app)
      .get("/api/tickets")
      .query({ station: "KITCHEN" });

    const barTicket = bar.body.find((t: { orderId: string }) => t.orderId === orderId);
    const kitchenTicket = kitchen.body.find((t: { orderId: string }) => t.orderId === orderId);
    expect(barTicket).toBeDefined();
    expect(kitchenTicket).toBeDefined();

    // Each station sees only its own lines.
    const barNames = (await request(app).get(`/api/tickets/by-order/${orderId}`)).body
      .find((t: { station: string }) => t.station === "BAR")
      .items.map((i: { name: string }) => i.name);
    expect(barNames).toEqual(["Test Whisky"]);
  });

  it("refuses to skip a stage of the service workflow", async () => {
    signInAs(OWNER_CLERK);
    const kitchenTicket = (
      await request(app).get("/api/tickets").query({ station: "KITCHEN" })
    ).body[0];
    const res = await request(app)
      .patch(`/api/tickets/${kitchenTicket.id}`)
      .send({ status: "SERVED" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("refuses a waiter advancing a station ticket", async () => {
    // A fresh order, because the test above walks its bar ticket to SERVED.
    await resetTable();
    signInAs(WAITER_CLERK);
    await request(app).post("/api/orders").send({
      table: "T1",
      tableId: `${ORG}-table`,
      items: [{ productId: `${ORG}-food`, quantity: 1 }],
    });
    signInAs(OWNER_CLERK);
    const barTicket = (
      await request(app).get("/api/tickets").query({ station: "BAR" })
    ).body.find((t: { status: string }) => t.status === "PENDING");

    signInAs(WAITER_CLERK);
    const res = await request(app)
      .patch(`/api/tickets/${barTicket.id}`)
      .send({ status: "ACCEPTED" });
    // The waiter may take orders but not confirm a station handed something over.
    expect(res.status).toBe(403);
  });

  it("applies the organization's own rates to the order", async () => {
    // Self-contained, because an earlier test may have left the floor clear.
    await resetTable();
    signInAs(WAITER_CLERK);
    const created = await request(app).post("/api/orders").send({
      table: "T1",
      tableId: `${ORG}-table`,
      items: [
        { productId: `${ORG}-drink`, quantity: 2, unitId: `${ORG}-shot` },
        { productId: `${ORG}-food`, quantity: 1 },
      ],
    });
    expect(created.status).toBe(201);

    signInAs(OWNER_CLERK);
    const order = (
      await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.organizationId, ORG))
        .orderBy(ordersTable.createdAt)
    ).pop();
    expect(order).toBeDefined();
    // 2 shots at 500 plus a 1500 steak is a 2500 subtotal.
    expect(order!.subtotal).toBe(2500);
    const org = await pool.query(
      `select tax_rate, service_charge_rate from dunda_organizations where id=$1`,
      [ORG],
    );
    const { tax_rate: tax, service_charge_rate: service } = org.rows[0];
    // Whatever this organization is configured for, the totals reflect it.
    expect(order!.serviceCharge).toBe(Math.round((order!.subtotal * service) / 100));
    expect(order!.total).toBe(order!.subtotal + order!.serviceCharge + order!.tax);
  });

  it("deducts stock only when the station serves the ticket", async () => {
    signInAs(OWNER_CLERK);
    const [before] = await db
      .select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.id, `${ORG}-inv-drink`));
    const barTicket = (await request(app).get("/api/tickets").query({ station: "BAR" }))
      .body[0];

    for (const status of ["ACCEPTED", "PREPARING", "READY"]) {
      const step = await request(app)
        .patch(`/api/tickets/${barTicket.id}`)
        .send({ status });
      expect(step.status).toBe(200);
    }
    const [mid] = await db
      .select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.id, `${ORG}-inv-drink`));
    // Made but not yet handed over: the bottle stays on the shelf.
    expect(Number(mid.currentQuantity)).toBe(Number(before.currentQuantity));

    const served = await request(app)
      .patch(`/api/tickets/${barTicket.id}`)
      .send({ status: "SERVED" });
    expect(served.status).toBe(200);
    const [after] = await db
      .select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.id, `${ORG}-inv-drink`));
    // Two shots at 30ml each.
    expect(Number(after.currentQuantity)).toBe(Number(before.currentQuantity) - 60);
  });

  it("frees the table once every ticket is closed", async () => {
    // Self-contained. This previously depended on a kitchen ticket left behind
    // by an earlier test, so it only passed when the suite happened to run in
    // one particular order.
    await resetTable();
    signInAs(WAITER_CLERK);
    const created = await request(app).post("/api/orders").send({
      table: "T1",
      tableId: `${ORG}-table`,
      items: [
        { productId: `${ORG}-drink`, quantity: 1, unitId: `${ORG}-shot` },
        { productId: `${ORG}-food`, quantity: 1 },
      ],
    });
    expect(created.status).toBe(201);

    const [occupied] = await db
      .select()
      .from(tablesTable)
      .where(eq(tablesTable.id, `${ORG}-table`));
    expect(occupied.status).toBe("OCCUPIED");

    signInAs(OWNER_CLERK);
    // Close both station tickets on this order.
    const tickets = (
      await request(app).get(`/api/tickets/by-order/${created.body.id}`)
    ).body;
    expect(tickets).toHaveLength(2);
    for (const ticket of tickets) {
      for (const status of ["ACCEPTED", "PREPARING", "READY", "SERVED"]) {
        const step = await request(app)
          .patch(`/api/tickets/${ticket.id}`)
          .send({ status });
        expect(step.status).toBe(200);
      }
    }

    const [table] = await db
      .select()
      .from(tablesTable)
      .where(eq(tablesTable.id, `${ORG}-table`));
    expect(table.status).toBe("AVAILABLE");
  });
});

describe("per-ticket permissions", () => {
  it("gives a station ticket list to somebody who may work the pass", async () => {
    signInAs(OWNER_CLERK);
    const res = await request(app).get("/api/tickets").query({ station: "BAR" });
    expect(res.status).toBe(200);
  });

  it("refuses the ticket list to a waiter", async () => {
    signInAs(WAITER_CLERK);
    const res = await request(app).get("/api/tickets").query({ station: "BAR" });
    expect(res.status).toBe(403);
  });

  it("requires a station", async () => {
    signInAs(OWNER_CLERK);
    const res = await request(app).get("/api/tickets");
    expect(res.status).toBe(400);
  });
});
