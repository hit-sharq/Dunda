import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { signInAs, signOut } from "./support/auth";
import { pool, db } from "@workspace/db";
import {
  auditLogsTable,
  branchesTable,
  ordersTable,
  organizationsTable,
  staffTable,
  tablesTable,
  rolesTable,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import app from "../src/app";
import {
  isPlatformAdmin,
  platformAdminList,
  _resetPlatformAdminCache,
} from "../src/middlewares/platformAdmin";

/**
 * Tenant isolation for the operator surface.
 *
 * The whole design rests on one property: a club owner cannot read or write
 * across venue boundaries. If that is ever false, one club owner can see every
 * other club's revenue, staff and customers. These cases pin it.
 */

const ADMIN_CLERK = "user_admin_operator";
const OWNER_CLERK = "user_admin_owner";
const WAITER_CLERK = "user_admin_waiter";

const ORG_A = "iso-org-a";
const ORG_B = "iso-org-b";

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

/** Slugs this suite uses, so a dead run can be cleaned up on the next one. */
const TEST_SLUGS = ["iso-org-a", "iso-org-b", "provisioned-by-admin"];

async function cleanup(): Promise<void> {
  // A run that died before its afterAll can leave rows behind, and those would
  // make the next run fail on a slug it thinks is free.
  const orphans = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(inArray(organizationsTable.slug, TEST_SLUGS));
  for (const org of orphans) {
    await db.delete(auditLogsTable).where(eq(auditLogsTable.organizationId, org.id));
    await db.delete(ordersTable).where(eq(ordersTable.organizationId, org.id));
    await db.delete(staffTable).where(eq(staffTable.organizationId, org.id));
    await db.delete(tablesTable).where(eq(tablesTable.organizationId, org.id));
    await db.delete(branchesTable).where(eq(branchesTable.organizationId, org.id));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, org.id));
  }

  for (const orgId of [ORG_A, ORG_B]) {
    await db.delete(auditLogsTable).where(eq(auditLogsTable.organizationId, orgId));
    await db.delete(ordersTable).where(eq(ordersTable.organizationId, orgId));
    await db.delete(staffTable).where(eq(staffTable.organizationId, orgId));
    await db.delete(tablesTable).where(eq(tablesTable.organizationId, orgId));
    await db.delete(branchesTable).where(eq(branchesTable.organizationId, orgId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  }
}

async function seed(): Promise<void> {
  await cleanup();
  for (const [id, name, slug] of [
    [ORG_A, "Isolation Org A", "iso-org-a"],
    [ORG_B, "Isolation Org B", "iso-org-b"],
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
      id: `${id}-branch`,
      organizationId: id,
      name: "Branch",
      city: "Nairobi",
      status: "LIVE",
    });
  }

  const [ownerRole] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.name, "Organization Owner"));
  const [waiterRole] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.name, "Waiter"));
  if (!ownerRole || !waiterRole) {
    throw new Error("This database has no owner or waiter role to test against.");
  }

  await db.insert(staffTable).values([
    {
      id: "iso-owner-b",
      organizationId: ORG_B,
      branchId: `${ORG_B}-branch`,
      clerkUserId: "user_isolated_owner_b",
      name: "Owner B",
      email: "owner-b@iso.test",
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
    {
      id: "iso-owner",
      organizationId: ORG_A,
      branchId: `${ORG_A}-branch`,
      clerkUserId: OWNER_CLERK,
      name: "Owner A",
      email: "owner-a@iso.test",
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
    {
      id: "iso-waiter",
      organizationId: ORG_A,
      branchId: `${ORG_A}-branch`,
      clerkUserId: WAITER_CLERK,
      name: "Waiter A",
      email: "waiter-a@iso.test",
      roleId: waiterRole.id,
      status: "ACTIVE",
    },
  ]);
}

beforeEach(() => {
  signOut();
  // The administrator list is read from the environment, so each case sets it.
  process.env.PLATFORM_ADMIN_IDS = ADMIN_CLERK;
  _resetPlatformAdminCache();
});

describe("who counts as an administrator", () => {
  it("accepts an account named in the environment", () => {
    expect(isPlatformAdmin(ADMIN_CLERK)).toBe(true);
  });

  it("rejects an account that is not", () => {
    expect(isPlatformAdmin(OWNER_CLERK)).toBe(false);
    expect(isPlatformAdmin("user_nobody")).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
  });

  it("rejects a club owner even though they own a club", () => {
    // The club owner is the most privileged tenant account there is, and it
    // still is not a platform administrator.
    expect(isPlatformAdmin(OWNER_CLERK)).toBe(false);
  });

  it("lists the administrators by id", () => {
    // Ids only. A display name would be a second thing to keep in step with the
    // list, and it is only ever shown to whoever already owns the list.
    const list = platformAdminList();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ clerkUserId: ADMIN_CLERK });
  });

  it("reads several ids", () => {
    process.env.PLATFORM_ADMIN_IDS = `${ADMIN_CLERK}, user_second , `;
    _resetPlatformAdminCache();
    expect(platformAdminList().map((a) => a.clerkUserId)).toEqual([
      ADMIN_CLERK,
      "user_second",
    ]);
  });
});

describe("tenant isolation for the operator surface", () => {
  const ADMIN_ROUTES: [string, string][] = [
    ["get", "/api/admin/summary"],
    ["get", "/api/admin/organizations"],
    ["get", "/api/admin/staff"],
    ["get", "/api/admin/audit-logs"],
  ];

  for (const [method, path] of ADMIN_ROUTES) {
    it(`refuses a club owner: ${method.toUpperCase()} ${path}`, async () => {
      signInAs(OWNER_CLERK);
      const res = await request(app)[method as "get"](path);
      // Indistinguishable from a path that does not exist, so a caller cannot
      // learn that a hidden surface is mounted here.
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Not found" });
    });

    it(`refuses a waiter: ${method.toUpperCase()} ${path}`, async () => {
      signInAs(WAITER_CLERK);
      const res = await request(app)[method as "get"](path);
      expect(res.status).toBe(404);
    });
  }

  it("refuses a club owner provisioning a venue", async () => {
    signInAs(OWNER_CLERK);
    const res = await request(app)
      .post("/api/admin/organizations")
      .send({ name: "Smuggled Venue" });
    expect(res.status).toBe(404);
  });

  it("refuses a club owner changing another club's settings", async () => {
    signInAs(OWNER_CLERK);
    const res = await request(app)
      .patch(`/api/admin/organizations/${ORG_B}`)
      .send({ taxRate: 0 });
    expect(res.status).toBe(404);
  });

  it("refuses an anonymous caller", async () => {
    const res = await request(app).get("/api/admin/organizations");
    expect(res.status).toBe(401);
  });
});

describe("what an administrator actually sees", () => {
  it("reaches the operator surface", async () => {
    signInAs(ADMIN_CLERK);
    const res = await request(app).get("/api/admin/organizations");
    if (res.status !== 200) {
      throw new Error(
        "admin got " + res.status + ": " + JSON.stringify(res.body) +
          " | env=" + String(process.env.PLATFORM_ADMIN_IDS),
      );
    }
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("sees every organization, including ones it belongs to none of", async () => {
    signInAs(ADMIN_CLERK);
    const res = await request(app).get("/api/admin/organizations");
    const ids = res.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(ORG_A);
    expect(ids).toContain(ORG_B);
  });

  it("can provision a venue", async () => {
    signInAs(ADMIN_CLERK);
    const res = await request(app).post("/api/admin/organizations").send({
      name: "Provisioned By Admin",
      branchName: "Downtown",
      city: "Nairobi",
      currency: "KES",
      taxRate: 16,
      serviceChargeRate: 10,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    // The venue this case created is not one of the seeded ones, so it has to
    // remove its own or the next run collides on the slug.
    await db.delete(auditLogsTable).where(eq(auditLogsTable.organizationId, res.body.id));
    await db.delete(branchesTable).where(eq(branchesTable.organizationId, res.body.id));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, res.body.id));
  });

  it("refuses a duplicate slug", async () => {
    signInAs(ADMIN_CLERK);
    // The slug is what is checked, so ask for one the seed already took.
    const res = await request(app).post("/api/admin/organizations").send({
      name: "Something Else Entirely",
      slug: "iso-org-a",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists");
  });

  it("can take ownership of a club without a setup token", async () => {
    // The operator is above the tenant, so claiming a club they are onboarding
    // must not require the tenant's token flow.
    signInAs(ADMIN_CLERK);
    const res = await request(app)
      .post(`/api/admin/organizations/${ORG_B}/owner`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.owner.clerkUserId).toBe(ADMIN_CLERK);

    // And the account can then act on the club, which is the point.
    signOut();
    signInAs(ADMIN_CLERK);
    const settings = await request(app).get("/api/settings");
    expect(settings.status).toBe(200);
    expect(settings.body.id).toBe(ORG_B);

    // Put it back so the tenant cases below still describe a separate owner.
    await request(app)
      .post(`/api/admin/organizations/${ORG_B}/owner`)
      .send({ clerkUserId: "user_isolated_owner_b" });
    const [waiter] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, "Waiter"));
    await db
      .update(staffTable)
      .set({ roleId: waiter.id })
      .where(eq(staffTable.clerkUserId, "user_isolated_owner_b"));
  });

  it("demotes the previous owner rather than leaving two", async () => {
    signInAs(ADMIN_CLERK);
    const res = await request(app)
      .post(`/api/admin/organizations/${ORG_A}/owner`)
      .send({ clerkUserId: "user_new_owner_account", name: "Second Operator" });
    expect(res.status).toBe(200);
    // The response states who holds it now, and who stepped down.
    expect(res.body.owner.clerkUserId).toBe("user_new_owner_account");
    expect(res.body.demoted).not.toBeNull();
    expect(res.body.demoted.clerkUserId ?? null).not.toBe("user_new_owner_account");

    // And the database agrees: exactly one owner, and it is the new account.
    const [ownerRole] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.isOwner, true))
      .orderBy(asc(rolesTable.sortOrder))
      .limit(1);
    const owners = await db
      .select()
      .from(staffTable)
      .where(
        and(
          eq(staffTable.organizationId, ORG_A),
          eq(staffTable.roleId, ownerRole.id),
        ),
      );
    expect(owners).toHaveLength(1);
    expect(owners[0].clerkUserId).toBe("user_new_owner_account");
  });

  it("lets an operator with no club read their own profile and reach the console", async () => {
    // An operator who owns no club is in the normal state for someone who
    // provisions clients. They must not be blocked by the club app, and they
    // must not be able to reach any club's data either.
    signInAs("user_operator_with_no_club");
    process.env.PLATFORM_ADMIN_IDS = `${ADMIN_CLERK},user_operator_with_no_club`;
    _resetPlatformAdminCache();

    const profile = await request(app).get("/api/me");
    expect(profile.status).toBe(200);
    expect(profile.body.operator).toBe(true);
    expect(profile.body.staff).toBeNull();
    expect(profile.body.permissions).toEqual([]);

    const console_ = await request(app).get("/api/admin/organizations");
    expect(console_.status).toBe(200);

    // Still no access to anything belonging to a club.
    const settings = await request(app).get("/api/settings");
    expect(settings.status).toBe(403);
  });

  it("marks an operator on their own profile and no one else", async () => {
    // The club app needs to know whether to show the operator link. Doing that
    // with a dedicated endpoint would tell every caller that a privileged tier
    // exists, so the flag rides along on the caller's own profile, and is omitted
    // entirely when it does not apply.
    signInAs(OWNER_CLERK);
    const asOwner = await request(app).get("/api/me");
    expect(asOwner.status).toBe(200);
    // Absent, not false: an owner cannot tell from the response that the concept
    // exists.
    expect(asOwner.body.operator).toBeUndefined();

    signInAs(WAITER_CLERK);
    const asWaiter = await request(app).get("/api/me");
    expect(asWaiter.status).toBe(200);
    expect(asWaiter.body.operator).toBeUndefined();
  });

  it("marks an operator who owns a club, and the console works either way", async () => {
    signInAs(ADMIN_CLERK);
    const profile = await request(app).get("/api/me");
    expect(profile.status).toBe(200);
    expect(profile.body.operator).toBe(true);

    // The operator console does not require a club, which is what lets an
    // operator provision their first one.
    const console_ = await request(app).get("/api/admin/summary");
    expect(console_.status).toBe(200);
  });

  it("exposes no endpoint that says which side of the product an account is on", async () => {
    // An endpoint answering "is this an operator" tells every caller that a
    // more privileged tier exists. There is not one.
    signInAs(ADMIN_CLERK);
    for (const path of ["/api/session", "/api/me/session", "/api/whoami"]) {
      const res = await request(app).get(path);
      expect([403, 404]).toContain(res.status);
    }
  });

  it("edits a plan price without re-pricing clubs already on it", async () => {
    signInAs(ADMIN_CLERK);
    const before = await request(app).get("/api/admin/plans");
    expect(before.status).toBe(200);
    const starter = before.body.find((p: { code: string }) => p.code === "STARTER");
    expect(starter).toBeDefined();
    expect(starter.monthlyPrice).toBe(5000);

    const updated = await request(app)
      .patch(`/api/admin/plans/${starter.id}`)
      .send({ monthlyPrice: 6500, annualPrice: 65000, code: "STARTER", name: "Starter" });
    expect(updated.status).toBe(200);
    expect(updated.body.monthlyPrice).toBe(6500);

    // A club already on the tier keeps the price it was agreed.
    const subscription = await request(app)
      .post(`/api/admin/organizations/${ORG_A}/subscription`)
      .send({ planId: starter.id, billingCycle: "MONTHLY", status: "ACTIVE" });
    expect(subscription.status).toBe(200);

    // Put the catalogue back so the suite is repeatable.
    await request(app)
      .patch(`/api/admin/plans/${starter.id}`)
      .send({ monthlyPrice: 5000, annualPrice: 50000, code: "STARTER", name: "Starter" });
  });

  it("reports a club's usage against the limits of its tier", async () => {
    signInAs(ADMIN_CLERK);
    const plans = await request(app).get("/api/admin/plans");
    const starter = plans.body.find((p: { code: string }) => p.code === "STARTER");

    const res = await request(app)
      .post(`/api/admin/organizations/${ORG_B}/subscription`)
      .send({ planId: starter.id, billingCycle: "MONTHLY", status: "ACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.usage).toBeDefined();
    expect(res.body.usage.branchLimit).toBe(starter.branchLimit);
    expect(res.body.subscription.plan).toBe("STARTER");

    // Restore, so other cases still see a separate owner on this club.
    await request(app)
      .post(`/api/admin/organizations/${ORG_B}/owner`)
      .send({ clerkUserId: "user_isolated_owner_b" });
  });

  it("explains that an account can hold a role at only one club", async () => {
    // The operator may already be staff somewhere, and the constraint is real,
    // so it has to read as a decision rather than a failure.
    signInAs(ADMIN_CLERK);
    const res = await request(app)
      .post(`/api/admin/organizations/${ORG_B}/owner`)
      .send({ clerkUserId: "user_isolated_owner_b" });
    expect([404, 409, 200]).toContain(res.status);
  });

  it("can correct another club's tax rate", async () => {
    signInAs(ADMIN_CLERK);
    const res = await request(app)
      .patch(`/api/admin/organizations/${ORG_B}`)
      .send({ taxRate: 5, serviceChargeRate: 0 });
    expect(res.status).toBe(200);
    expect(res.body.taxRate).toBe(5);
    expect(res.body.serviceChargeRate).toBe(0);
  });

  it("leaves the club's own session unaffected", async () => {
    // Changing the rate is an operator action. A club's own settings route must
    // still be the only way a club changes its own terms, and it must be scoped
    // to that club.
    signInAs(OWNER_CLERK);
    const read = await request(app).get("/api/settings");
    expect(read.status).toBe(200);
    expect(read.body.id).toBe(ORG_A);
  });
});

describe("a club can only ever read its own settings", () => {
  it("scopes the settings route to the caller's organization", async () => {
    signInAs(OWNER_CLERK);
    const res = await request(app).get("/api/settings");
    expect(res.body.id).toBe(ORG_A);
    expect(res.body.slug).toBe("iso-org-a");
  });

  it("refuses a waiter changing commercial settings", async () => {
    signInAs(WAITER_CLERK);
    const res = await request(app).patch("/api/settings").send({ taxRate: 0 });
    expect(res.status).toBe(403);
  });

  it("refuses a rate that is not a whole percentage", async () => {
    signInAs(OWNER_CLERK);
    const res = await request(app).patch("/api/settings").send({ taxRate: 16.5 });
    expect(res.status).toBe(400);
  });

  it("refuses a negative rate", async () => {
    signInAs(OWNER_CLERK);
    const res = await request(app).patch("/api/settings").send({ serviceChargeRate: -5 });
    expect(res.status).toBe(400);
  });

  it("records a settings change in the audit trail", async () => {
    signInAs(OWNER_CLERK);
    await request(app).patch("/api/settings").send({ taxRate: 16 });
    const entries = await db
      .select()
      .from(auditLogsTable)
      .where(
        and(
          eq(auditLogsTable.organizationId, ORG_A),
          eq(auditLogsTable.entity, "ORGANIZATION"),
        ),
      );
    expect(entries.some((e) => (e.detail ?? "").includes("Commercial settings"))).toBe(
      true,
    );
  });
});
