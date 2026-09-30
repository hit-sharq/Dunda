import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../src/index";
import {
  db,
  branchesTable,
  branchMembersTable,
  categoriesTable,
  inventoryAlertsTable,
  inventoryItemsTable,
  orderTicketsTable,
  orderTicketItemsTable,
  ordersTable,
  organizationMembersTable,
  organizationsTable,
  productsTable,
  productUnitsTable,
  rolesTable,
  staffTable,
  stockMovementsTable,
  tablesTable,
  auditLogsTable,
} from "../src/index";
import { and, eq } from "drizzle-orm";
import { withRetry } from "./helpers";
import { claimStaffByEmail } from "../../../artifacts/api-server/src/lib/claimStaff";
import {
  issueRealtimeTicket,
  redeemRealtimeTicket,
  _clearRealtimeTickets,
} from "../../../artifacts/api-server/src/lib/realtimeTickets";

/**
 * The paths where the system has to say no.
 *
 * These are the cases that decide whether an invitation is safe: a person must
 * only ever inherit the record somebody made for them, and never a colleague's.
 * They are also the cases least likely to be exercised by hand, which is exactly
 * why they need a suite.
 */

const ORG = "test-claim-org";
const BRANCH = "test-claim-branch";
const CLERK = "user_test_claim_1";
const OTHER_CLERK = "user_test_claim_2";

/** Roles are looked up by name, because ids differ between databases. */
async function roleId(name: string): Promise<string> {
  const row = (
    await db.select().from(rolesTable).where(eq(rolesTable.name, name)).limit(1)
  )[0];
  if (!row) throw new Error(`This database has no "${name}" role`);
  return row.id;
}

let WAITER_ROLE = "";
let BARTENDER_ROLE = "";
let CASHIER_ROLE = "";

beforeAll(async () => {
  // The database is a managed service reached over the public internet and its
  // connection is intermittently refused, so every attempt is retried. Retrying
  // the whole setup rather than a single probe means a blip mid-setup does not
  // read as a code failure.
  const deadline = Date.now() + 120_000;
  let lastError: unknown;
  for (;;) {
    try {
      await pool.query("select 1");
      await cleanup();
      break;
    } catch (err) {
      lastError = err;
      if (Date.now() > deadline) {
        throw new Error(
          `Could not prepare the database: ${(lastError as Error)?.message?.split("\n")[0]}`,
        );
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  await db.insert(organizationsTable).values({
    id: ORG,
    name: "Claim Test Org",
    slug: "claim-test-org",
    currency: "KES",
    taxRate: 16,
    serviceChargeRate: 10,
  });
  await db.insert(branchesTable).values({
    id: BRANCH,
    organizationId: ORG,
    name: "Claim Branch",
    city: "Nairobi",
    status: "LIVE",
  });
  WAITER_ROLE = await roleId("Waiter");
  BARTENDER_ROLE = await roleId("Bartender");
  CASHIER_ROLE = await roleId("Cashier");
  await db.insert(staffTable).values([
    {
      id: "test-claim-waiter",
      organizationId: ORG,
      branchId: BRANCH,
      clerkUserId: null,
      name: "Pending Waiter",
      email: "waiter@example.com",
      roleId: WAITER_ROLE,
      status: "ACTIVE",
    },
    {
      id: "test-claim-linked",
      organizationId: ORG,
      branchId: BRANCH,
      clerkUserId: OTHER_CLERK,
      name: "Already Linked",
      email: "linked@example.com",
      roleId: BARTENDER_ROLE,
      status: "ACTIVE",
    },
  ]);
});

afterAll(async () => {
  await cleanup();
});

async function cleanup(): Promise<void> {
  await db.delete(branchMembersTable).where(eq(branchMembersTable.organizationId, ORG));
  await db.delete(organizationMembersTable).where(eq(organizationMembersTable.organizationId, ORG));
  await db.delete(stockMovementsTable).where(eq(stockMovementsTable.organizationId, ORG));
  await db.delete(inventoryAlertsTable).where(eq(inventoryAlertsTable.organizationId, ORG));
  await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.organizationId, ORG));
  await db.delete(orderTicketItemsTable).where(eq(orderTicketItemsTable.organizationId, ORG));
  await db.delete(orderTicketsTable).where(eq(orderTicketsTable.organizationId, ORG));
  // This suite creates no orders or order lines, so there is nothing to unwind
  // there. Everything it does create is keyed by this organization id.
  await db.delete(ordersTable).where(eq(ordersTable.organizationId, ORG));
  await db.delete(tablesTable).where(eq(tablesTable.organizationId, ORG));
  await db.delete(productUnitsTable).where(eq(productUnitsTable.productId, "test-claim-prod"));
  await db.delete(productsTable).where(eq(productsTable.organizationId, ORG));
  await db.delete(categoriesTable).where(eq(categoriesTable.organizationId, ORG));
  await db.delete(staffTable).where(eq(staffTable.organizationId, ORG));
  await db.delete(auditLogsTable).where(eq(auditLogsTable.organizationId, ORG));
  await db.delete(branchesTable).where(eq(branchesTable.id, BRANCH));
  await db.delete(organizationsTable).where(eq(organizationsTable.id, ORG));
}

async function resetFixtures(): Promise<void> {
  return withRetry(async () => {
  await db
    .update(staffTable)
    .set({ clerkUserId: null })
    .where(eq(staffTable.id, "test-claim-waiter"));
  await db
    .update(staffTable)
    .set({ clerkUserId: OTHER_CLERK, email: "linked@example.com" })
    .where(eq(staffTable.id, "test-claim-linked"));
  await db
    .delete(branchMembersTable)
    .where(eq(branchMembersTable.organizationId, ORG));
  await db
    .delete(organizationMembersTable)
    .where(eq(organizationMembersTable.organizationId, ORG));
  await db
    .delete(auditLogsTable)
    .where(eq(auditLogsTable.organizationId, ORG));
  });
}

describe("claiming a pending staff record by email", () => {
  it("claims an unlinked record whose email matches", async () => {
    await resetFixtures();
    const claimed = await claimStaffByEmail(CLERK, "waiter@example.com");
    expect(claimed).toBe("test-claim-waiter");

    const [row] = await db.select().from(staffTable).where(eq(staffTable.id, "test-claim-waiter"));
    expect(row.clerkUserId).toBe(CLERK);
  });

  it("writes the membership rows the role checks depend on", async () => {
    await resetFixtures();
    await claimStaffByEmail(CLERK, "waiter@example.com");
    const orgMembers = await db
      .select()
      .from(organizationMembersTable)
      .where(eq(organizationMembersTable.clerkUserId, CLERK));
    expect(orgMembers).toHaveLength(1);
    expect(orgMembers[0].roleId).toBe(WAITER_ROLE);
    const branchMembers = await db
      .select()
      .from(branchMembersTable)
      .where(eq(branchMembersTable.clerkUserId, CLERK));
    expect(branchMembers).toHaveLength(1);
  });

  it("records the claim in the audit log", async () => {
    await resetFixtures();
    await claimStaffByEmail(CLERK, "waiter@example.com");
    const entries = await db
      .select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.organizationId, ORG));
    expect(entries.some((e) => e.entity === "STAFF")).toBe(true);
    expect(entries.some((e) => (e.detail ?? "").includes("signed in"))).toBe(true);
  });

  it("refuses a record that is already linked to somebody else", async () => {
    await resetFixtures();
    // linked@example.com belongs to a staff record that already has an account.
    const claimed = await claimStaffByEmail(CLERK, "linked@example.com");
    expect(claimed).toBeNull();

    const [row] = await db.select().from(staffTable).where(eq(staffTable.id, "test-claim-linked"));
    expect(row.clerkUserId).toBe(OTHER_CLERK);
  });

  it("never matches on the email of an already-claimed record", async () => {
    await resetFixtures();
    await claimStaffByEmail(CLERK, "waiter@example.com");
    // A second account presenting the same address must inherit nothing, because
    // the record is no longer unclaimed.
    const second = await claimStaffByEmail("user_test_claim_3", "waiter@example.com");
    expect(second).toBeNull();

    const [row] = await db.select().from(staffTable).where(eq(staffTable.id, "test-claim-waiter"));
    expect(row.clerkUserId).toBe(CLERK);
  });

  it("claims nothing when two unlinked records share an address", async () => {
    await resetFixtures();
    await db.insert(staffTable).values({
      id: "test-claim-dupe",
      organizationId: ORG,
      branchId: BRANCH,
      clerkUserId: null,
      name: "Second Pending",
      email: "waiter@example.com",
      roleId: CASHIER_ROLE,
      status: "ACTIVE",
    });
    try {
      const claimed = await claimStaffByEmail(CLERK, "waiter@example.com");
      expect(claimed).toBeNull();
      const rows = await db
        .select()
        .from(staffTable)
        .where(
          and(
            eq(staffTable.organizationId, ORG),
            eq(staffTable.email, "waiter@example.com"),
          ),
        );
      expect(rows.every((r) => r.clerkUserId === null)).toBe(true);
    } finally {
      await db.delete(staffTable).where(eq(staffTable.id, "test-claim-dupe"));
    }
  });

  it("matches regardless of address casing", async () => {
    await resetFixtures();
    const claimed = await claimStaffByEmail(CLERK, "Waiter@Example.COM");
    expect(claimed).toBe("test-claim-waiter");
  });

  it("does nothing without an email", async () => {
    await resetFixtures();
    expect(await claimStaffByEmail(CLERK, null)).toBeNull();
    expect(await claimStaffByEmail(CLERK, "   ")).toBeNull();
  });

  it("does nothing for an address nobody is waiting on", async () => {
    await resetFixtures();
    expect(await claimStaffByEmail(CLERK, "stranger@example.com")).toBeNull();
  });
});

describe("realtime tickets", () => {
  beforeEach(() => _clearRealtimeTickets());

  it("redeems a ticket for the account it was issued to", () => {
    const ticket = issueRealtimeTicket(CLERK);
    expect(redeemRealtimeTicket(ticket)).toBe(CLERK);
  });

  it("refuses a replayed ticket", () => {
    const ticket = issueRealtimeTicket(CLERK);
    expect(redeemRealtimeTicket(ticket)).toBe(CLERK);
    // The whole point: a token in a URL is copied, so it must be one-shot.
    expect(redeemRealtimeTicket(ticket)).toBeNull();
  });

  it("refuses an unknown ticket", () => {
    expect(redeemRealtimeTicket("never-issued")).toBeNull();
  });

  it("issues a distinct ticket each time", () => {
    const seen = new Set(
      Array.from({ length: 100 }, () => issueRealtimeTicket(CLERK)),
    );
    expect(seen.size).toBe(100);
  });

  it("refuses to issue once the outstanding limit is reached", () => {
    // A guard against an unbounded map if tickets are never redeemed.
    for (let i = 0; i < 5_000; i += 1) issueRealtimeTicket(CLERK);
    expect(() => issueRealtimeTicket(CLERK)).toThrow();
  });
});
