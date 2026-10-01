import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, sql, count } from "drizzle-orm";
import { z } from "zod";
import {
  auditLogsTable,
  branchesTable,
  ordersTable,
  organizationsTable,
  rolesTable,
  staffTable,
  subscriptionsTable,
  plansTable,
  tablesTable,
} from "@workspace/db";
import { db } from "@workspace/db";
import { requirePlatformAdmin } from "../middlewares/platformAdmin";
import { logger } from "../lib/logger";
import { getTenantSettings } from "../lib/tenantSettings";
import { DEFAULT_REPORT_DAYS } from "../lib/constants";

const router: IRouter = Router();

/**
 * Dunda's own administration.
 *
 * This is the cross-tenant view: every venue on the platform, what it is doing,
 * and the configuration an operator needs to set. It is guarded by a list in
 * Dunda's database rather than a role, so no venue owner can reach it.
 */

// Every route below requires platform administration, so this is applied once.
router.use(requirePlatformAdmin);

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** The headline: how the platform is doing, across every venue. */
router.get("/summary", async (_req, res): Promise<void> => {
  const since = new Date(Date.now() - DEFAULT_REPORT_DAYS * 24 * 60 * 60 * 1000);

  const [orgTotals, staffTotals, orderTotals] = await Promise.all([
    db
      .select({
        organizations: count(),
        liveBranches: sql<number>`count(*) filter (where "dunda_branches".status = 'LIVE')`.mapWith(Number),
      })
      .from(organizationsTable)
      .leftJoin(branchesTable, eq(branchesTable.organizationId, organizationsTable.id)),
    db
      .select({ active: sql<number>`count(*) filter (where "dunda_staff".status = 'ACTIVE')`.mapWith(Number) })
      .from(staffTable),
    db
      .select({
        recent: sql<number>`count(*) filter (where "dunda_orders".status = 'COMPLETED')`.mapWith(Number),
        revenue: sql<number>`coalesce(sum("dunda_orders".total) filter (where "dunda_orders".status = 'COMPLETED'), 0)`.mapWith(
          Number,
        ),
      })
      .from(ordersTable)
      .where(gte(ordersTable.createdAt, since)),
  ]);

  res.json({
    venues: orgTotals[0]?.organizations ?? 0,
    liveBranches: orgTotals[0]?.liveBranches ?? 0,
    staff: staffTotals[0]?.active ?? 0,
    ordersInWindow: orderTotals[0]?.recent ?? 0,
    revenueInWindow: orderTotals[0]?.revenue ?? 0,
      windowDays: DEFAULT_REPORT_DAYS,
  });
});

/** Every venue, with enough signal to decide whether it needs attention. */
router.get("/organizations", async (_req, res): Promise<void> => {
  const since = new Date(Date.now() - DEFAULT_REPORT_DAYS * 24 * 60 * 60 * 1000);

  const orgs = await db
    .select()
    .from(organizationsTable)
    .orderBy(desc(organizationsTable.createdAt));

  const ids = orgs.map((o) => o.id);

  type BranchRow = typeof branchesTable.$inferSelect;
  type StaffRollup = { organizationId: string; total: number; active: number };
  type OrderRollup = {
    organizationId: string;
    orders: number;
    revenue: number;
    lastOrderAt: Date | null;
  };
  type TableRollup = { organizationId: string; tables: number };

  const [branches, staff, orders, subs, tableCounts] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(branchesTable)
          .where(inArray(branchesTable.organizationId, ids))
      : ([] as BranchRow[]),
    ids.length
      ? db
          .select({
            organizationId: staffTable.organizationId,
            total: sql<number>`count(*)`.mapWith(Number),
            active: sql<number>`count(*) filter (where "dunda_staff".status = 'ACTIVE')`.mapWith(Number),
          })
          .from(staffTable)
          .where(inArray(staffTable.organizationId, ids))
          .groupBy(staffTable.organizationId)
      : ([] as StaffRollup[]),
    ids.length
      ? db
          .select({
            organizationId: ordersTable.organizationId,
            orders: sql<number>`count(*) filter (where "dunda_orders".status = 'COMPLETED')`.mapWith(Number),
            revenue: sql<number>`coalesce(sum("dunda_orders".total) filter (where "dunda_orders".status = 'COMPLETED'), 0)`.mapWith(
              Number,
            ),
            lastOrderAt: sql<Date>`max("dunda_orders".created_at)`,
          })
          .from(ordersTable)
          .where(inArray(ordersTable.organizationId, ids))
          .groupBy(ordersTable.organizationId)
      : ([] as OrderRollup[]),
    ids.length
      ? db.select().from(subscriptionsTable).where(inArray(subscriptionsTable.organizationId, ids))
      : ([] as (typeof subscriptionsTable.$inferSelect)[]),
    ids.length
      ? db
          .select({
            organizationId: tablesTable.organizationId,
            tables: sql<number>`count(*)`.mapWith(Number),
          })
          .from(tablesTable)
          .where(inArray(tablesTable.organizationId, ids))
          .groupBy(tablesTable.organizationId)
      : ([] as TableRollup[]),
  ]);

  res.json(
    orgs.map((org) => {
      const orgBranches = branches.filter((b) => b.organizationId === org.id);
      const orgStaff = staff.find((s) => s.organizationId === org.id);
      const orgOrders = orders.find((o) => o.organizationId === org.id);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        currency: org.currency,
        taxRate: org.taxRate,
        serviceChargeRate: org.serviceChargeRate,
        createdAt: org.createdAt,
        branches: orgBranches.length,
        liveBranches: orgBranches.filter((b) => b.status === "LIVE").length,
        staff: orgStaff?.total ?? 0,
        activeStaff: orgStaff?.active ?? 0,
        tables: tableCounts.find((t) => t.organizationId === org.id)?.tables ?? 0,
        ordersInWindow: orgOrders?.orders ?? 0,
        revenueInWindow: orgOrders?.revenue ?? 0,
        lastOrderAt: orgOrders?.lastOrderAt ?? null,
        plan: subs.find((s) => s.organizationId === org.id)?.plan ?? null,
        subscriptionStatus: subs.find((s) => s.organizationId === org.id)?.status ?? null,
      };
    }),
  );
});

const CreateOrganizationBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  currency: z.string().length(3).default("KES"),
  taxRate: z.number().int().min(0).max(100).default(16),
  serviceChargeRate: z.number().int().min(0).max(100).default(10),
  branchName: z.string().min(1).default("Main Branch"),
  city: z.string().nullable().optional(),
});

/**
 * Creates a venue.
 *
 * A venue exists before anybody signs up for it, which is how an operator
 * provisions a customer: the organization and its first branch are in place, and
 * the owner is invited afterwards.
 */
router.post("/organizations", async (req, res): Promise<void> => {
  const parsed = CreateOrganizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const slug = slugify(data.slug || data.name);
  const existing = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, slug));
  if (existing.length) {
    res.status(409).json({ error: `A venue with the slug "${slug}" already exists.` });
    return;
  }

  const orgId = uid("org");
  const branchId = uid("branch");

  await db.transaction(async (tx) => {
    await tx.insert(organizationsTable).values({
      id: orgId,
      name: data.name,
      slug,
      currency: data.currency.toUpperCase(),
      taxRate: data.taxRate,
      serviceChargeRate: data.serviceChargeRate,
    });
    await tx.insert(branchesTable).values({
      id: branchId,
      organizationId: orgId,
      name: data.branchName,
      // A branch row requires a city; the column is not nullable.
      city: data.city ?? "",
      status: "LIVE",
    });
    await tx.insert(auditLogsTable).values({
      id: uid("audit"),
      organizationId: orgId,
      branchId,
      staffId: null,
      action: "CREATE",
      entity: "ORGANIZATION",
      entityId: orgId,
      detail: `Venue "${data.name}" provisioned by administrator ${req.platformAdmin?.clerkUserId ?? "unknown"}.`,
    });
  });

  res.status(201).json({ id: orgId, slug, branchId });
});

/**
 * The commercial settings of one venue.
 *
 * Tax and service charge are per-venue, so this is how an operator corrects the
 * rate a venue is actually charging. Every existing receipt keeps the figures it
 * was issued with, because the rate is copied onto the order when it is rung in.
 */
router.patch("/organizations/:organizationId", async (req, res): Promise<void> => {
  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      currency: z.string().length(3).optional(),
      taxRate: z.number().int().min(0).max(100).optional(),
      serviceChargeRate: z.number().int().min(0).max(100).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, req.params.organizationId));
  if (!existing) {
    res.status(404).json({ error: "That venue does not exist." });
    return;
  }

  const [updated] = await db
    .update(organizationsTable)
    .set({
      ...parsed.data,
      currency: parsed.data.currency?.toUpperCase(),
    })
    .where(eq(organizationsTable.id, existing.id))
    .returning();

  const changes = Object.entries(parsed.data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${existing[k as keyof typeof existing]} -> ${v}`);
  if (changes.length) {
    await db.insert(auditLogsTable).values({
      id: uid("audit"),
      organizationId: existing.id,
      staffId: null,
      action: "UPDATE",
      entity: "ORGANIZATION",
      entityId: existing.id,
      detail: `Settings changed by administrator ${req.platformAdmin?.clerkUserId ?? "unknown"}. ${changes.join("; ")}`,
    });
  }

  res.json({ ...updated, settings: await getTenantSettings(existing.id) });
});

/**
 * Assigns the owner of a client.
 *
 * An operator provisions a client, so they are above that tenant rather than
 * inside it. The setup token exists for the tenant case, where a brand new
 * organization has nobody to invite its first owner; it is not how an operator
 * should have to gain access to a club they are onboarding.
 *
 * The same endpoint also reassigns ownership, which is how you hand a running
 * club to the person who actually runs it.
 */
const AssignOwnerBody = z.object({
  clerkUserId: z
    .string()
    .min(4)
    .optional()
    .describe("Defaults to the administrator making the request."),
  name: z.string().min(1).optional(),
  email: z.string().nullable().optional(),
  roleId: z.string().optional(),
});

router.post("/organizations/:organizationId/owner", async (req, res): Promise<void> => {
  const parsed = AssignOwnerBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, req.params.organizationId));
  if (!org) {
    res.status(404).json({ error: "That venue does not exist." });
    return;
  }

  const [ownerRole, administratorRole] = await Promise.all([
    db.select().from(rolesTable).where(eq(rolesTable.isOwner, true)).limit(1),
    db.select().from(rolesTable).where(eq(rolesTable.name, "Administrator")).limit(1),
  ]);
  if (!ownerRole[0]) {
    res.status(500).json({ error: "This database has no owner role configured." });
    return;
  }

  const clerkUserId = data.clerkUserId ?? req.platformAdmin?.clerkUserId;
  if (!clerkUserId) {
    res.status(400).json({ error: "No account was supplied to assign." });
    return;
  }

  // A staff record is keyed by account alone, so one account can hold a role at
  // only one organization. That is worth saying plainly rather than letting the
  // unique constraint surface as a 500.
  const [heldElsewhere] = await db
    .select({ id: staffTable.id, organizationId: staffTable.organizationId })
    .from(staffTable)
    .where(eq(staffTable.clerkUserId, clerkUserId));
  if (heldElsewhere && heldElsewhere.organizationId !== org.id) {
    res.status(409).json({
      error:
        "That account already holds a staff role at another organization. Give the club a named owner instead, or move that record first.",
      code: "STAFF_RECORD_EXISTS_ELSEWHERE",
    });
    return;
  }

  // The account may already have a staff record here, or not yet.
  const [existingForAccount] = await db
    .select()
    .from(staffTable)
    .where(
      and(
        eq(staffTable.organizationId, org.id),
        eq(staffTable.clerkUserId, clerkUserId),
      ),
    );

  const result = await db.transaction(async (tx) => {
    // Whoever holds the owner role now steps down rather than two people
    // holding identical authority with no record of which one decided.
    const [previousOwner] = await tx
      .select()
      .from(staffTable)
      .where(
        and(
          eq(staffTable.organizationId, org.id),
          eq(staffTable.roleId, ownerRole[0].id),
        ),
      );

    if (previousOwner && previousOwner.clerkUserId !== clerkUserId) {
      await tx
        .update(staffTable)
        .set({
          roleId: administratorRole[0]?.id ?? previousOwner.roleId,
          updatedAt: new Date(),
        })
        .where(eq(staffTable.id, previousOwner.id));
    }

    const [branch] = await tx
      .select({ id: branchesTable.id })
      .from(branchesTable)
      .where(eq(branchesTable.organizationId, org.id))
      .limit(1);

    let owner;
    if (existingForAccount) {
      [owner] = await tx
        .update(staffTable)
        .set({ roleId: ownerRole[0].id, updatedAt: new Date() })
        .where(eq(staffTable.id, existingForAccount.id))
        .returning();
    } else {
      [owner] = await tx
        .insert(staffTable)
        .values({
          id: uid("staff"),
          organizationId: org.id,
          branchId: branch?.id ?? null,
          clerkUserId,
          name: data.name ?? data.email ?? "Owner",
          email: data.email ?? null,
          roleId: data.roleId ?? ownerRole[0].id,
          status: "ACTIVE",
        })
        .returning();
    }

    await tx.insert(auditLogsTable).values({
      id: uid("audit"),
      organizationId: org.id,
      branchId: branch?.id ?? null,
      staffId: null,
      action: "UPDATE",
      entity: "OWNERSHIP",
      entityId: org.id,
      detail: `Ownership assigned to ${clerkUserId} by administrator ${req.platformAdmin?.clerkUserId ?? "unknown"}.`,
    });

    return { owner, previousOwner: previousOwner ?? null };
  });

  res.json({
    owner: {
      id: result.owner.id,
      name: result.owner.name,
      clerkUserId: result.owner.clerkUserId,
    },
    demoted:
      result.previousOwner && result.previousOwner.clerkUserId !== clerkUserId
        ? { id: result.previousOwner.id, name: result.previousOwner.name }
        : null,
  });
});

// ===========================================================================
// Plans and subscriptions
// ===========================================================================

const PlanBody = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  monthlyPrice: z.number().int().min(0),
  annualPrice: z.number().int().min(0),
  branchLimit: z.number().int().min(0),
  userLimit: z.number().int().min(0),
  modules: z.array(z.string()).default([]),
  isCustom: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

router.get("/plans", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(plansTable)
    .orderBy(plansTable.sortOrder);
  res.json(rows);
});

/**
 * Creates a tier.
 *
 * Prices live here rather than on each subscription, so changing what a club
 * pays is one edit instead of touching every club that is on that tier.
 */
router.post("/plans", async (req, res): Promise<void> => {
  const parsed = PlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid plan." });
    return;
  }
  const existing = await db
    .select({ id: plansTable.id })
    .from(plansTable)
    .where(eq(plansTable.code, parsed.data.code.toUpperCase()));
  if (existing.length) {
    res.status(409).json({ error: `A tier with the code "${parsed.data.code}" already exists.` });
    return;
  }

  const [row] = await db
    .insert(plansTable)
    .values({
      id: uid("plan"),
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
    })
    .returning();
  res.status(201).json(row);
});

/**
 * Edits a tier.
 *
 * Existing subscriptions keep their own terms, so changing a price here does not
 * silently re-price clubs that are already on it. That is deliberate: a club is
 * agreed a price, and the catalogue is what new clubs are sold.
 */
router.patch("/plans/:planId", async (req, res): Promise<void> => {
  const parsed = PlanBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid change." });
    return;
  }
  const [before] = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.id, req.params.planId));
  if (!before) {
    res.status(404).json({ error: "That tier does not exist." });
    return;
  }

  const [row] = await db
    .update(plansTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(plansTable.id, before.id))
    .returning();

  const changes = Object.entries(parsed.data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${JSON.stringify(before[k as keyof typeof before])} -> ${JSON.stringify(v)}`);
  if (changes.length) {
    // Deliberately not written to a tenant audit trail: a tier change belongs to
    // no single club, and the audit table is scoped to one.
    logger.info(
      { planId: row.id, changedBy: req.platformAdmin?.clerkUserId, changes },
      "Plan catalogue changed",
    );
  }
  res.json(row);
});

const SubscriptionBody = z.object({
  planId: z.string().nullable().optional(),
  /** Overrides the plan's list price when a club is agreed something different. */
  monthlyPrice: z.number().int().min(0).nullable().optional(),
  billingCycle: z.enum(["MONTHLY", "ANNUAL", "CUSTOM"]).optional(),
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"]).optional(),
  renewsAt: z.coerce.date().nullable().optional(),
});

/**
 * Puts a club on a tier, and reports what it is actually using against what the
 * tier allows. That is the number you need when someone says their plan is too
 * small.
 */
router.post("/organizations/:organizationId/subscription", async (req, res): Promise<void> => {
  const parsed = SubscriptionBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid subscription." });
    return;
  }
  const data = parsed.data;

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, req.params.organizationId));
  if (!org) {
    res.status(404).json({ error: "That venue does not exist." });
    return;
  }

  const [plan] = data.planId
    ? await db.select().from(plansTable).where(eq(plansTable.id, data.planId))
    : [undefined];
  if (data.planId && !plan) {
    res.status(400).json({ error: "That tier does not exist." });
    return;
  }

  const [existing] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.organizationId, org.id));

  const cycle = data.billingCycle ?? existing?.billingCycle ?? "MONTHLY";
  const price =
    data.monthlyPrice ??
    (plan
      ? cycle === "ANNUAL"
        ? plan.annualPrice / 12
        : plan.monthlyPrice
      : existing?.planId
        ? null
        : 0);

  // Current usage is measured, never trusted from the request.
  const [usage] = await db
    .select({
      branches: sql<number>`count(*)`.mapWith(Number),
    })
    .from(branchesTable)
    .where(eq(branchesTable.organizationId, org.id));
  const [people] = await db
    .select({ users: sql<number>`count(*)`.mapWith(Number) })
    .from(staffTable)
    .where(
      and(
        eq(staffTable.organizationId, org.id),
        eq(staffTable.status, "ACTIVE"),
      ),
    );

  const branchLimit = plan?.branchLimit ?? existing?.branchLimit ?? 1;
  const userLimit = plan?.userLimit ?? existing?.userLimit ?? 5;

  const subscription = await db.transaction(async (tx): Promise<typeof subscriptionsTable.$inferSelect> => {
    if (existing) {
      return (
        await tx
          .update(subscriptionsTable)
          .set({
            planId: data.planId !== undefined ? data.planId : existing.planId,
            plan: plan?.code ?? existing.plan,
            billingCycle: cycle,
            status: data.status ?? existing.status,
            renewsAt: data.renewsAt !== undefined ? data.renewsAt : existing.renewsAt,
            branchLimit,
            userLimit,
            currentBranches: usage?.branches ?? 0,
            currentUsers: people?.users ?? 0,
          })
          .where(eq(subscriptionsTable.id, existing.id))
          .returning()
      )[0];
    }
    return (
      await tx
        .insert(subscriptionsTable)
        .values({
          id: uid("sub"),
          organizationId: org.id,
          planId: plan?.id ?? null,
          plan: plan?.code ?? "STARTER",
          billingCycle: cycle,
          status: data.status ?? "ACTIVE",
          renewsAt: data.renewsAt ?? null,
          branchLimit,
          userLimit,
          currentBranches: usage?.branches ?? 0,
          currentUsers: people?.users ?? 0,
        })
        .returning()
    )[0];
  });

  await db.insert(auditLogsTable).values({
    id: uid("audit"),
    organizationId: org.id,
    staffId: null,
    action: "UPDATE",
    entity: "SUBSCRIPTION",
    entityId: subscription.id,
    detail: `Subscription set by ${req.platformAdmin?.clerkUserId ?? "an administrator"}: ${subscription.plan} on ${subscription.billingCycle}, ${subscription.status}.`,
  });

  res.json({
    subscription,
    monthlyPrice: price,
    usage: {
      branches: usage?.branches ?? 0,
      branchLimit,
      overBranchLimit: plan && !plan.isCustom && plan.branchLimit > 0
        ? (usage?.branches ?? 0) > plan.branchLimit
        : false,
      users: people?.users ?? 0,
      userLimit,
      overUserLimit:
        plan && !plan.isCustom && plan.userLimit > 0
          ? (people?.users ?? 0) > plan.userLimit
          : false,
    },
  });
});

/** Every staff member on the platform, across every venue. */
router.get("/staff", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: staffTable.id,
      name: staffTable.name,
      email: staffTable.email,
      status: staffTable.status,
      clerkUserId: staffTable.clerkUserId,
      organizationId: staffTable.organizationId,
      branchId: staffTable.branchId,
      roleId: staffTable.roleId,
      createdAt: staffTable.createdAt,
      organization: organizationsTable.name,
      role: rolesTable.name,
    })
    .from(staffTable)
    .leftJoin(organizationsTable, eq(organizationsTable.id, staffTable.organizationId))
    .leftJoin(rolesTable, eq(rolesTable.id, staffTable.roleId))
    .orderBy(desc(staffTable.createdAt))
    .limit(500);

  res.json(
    rows.map((r) => ({
      ...r,
      // A null clerk id means the invite has not been accepted yet.
      linked: Boolean(r.clerkUserId),
    })),
  );
});

/** The audit trail across every venue. */
router.get("/audit-logs", async (req, res): Promise<void> => {
  const parsed = z
    .object({
      organizationId: z.string().optional(),
      action: z.string().optional(),
      limit: z.coerce.number().min(1).max(500).default(150),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select({
      log: auditLogsTable,
      organization: organizationsTable.name,
    })
    .from(auditLogsTable)
    .leftJoin(organizationsTable, eq(organizationsTable.id, auditLogsTable.organizationId))
    .where(
      and(
        parsed.data.organizationId
          ? eq(auditLogsTable.organizationId, parsed.data.organizationId)
          : undefined,
        parsed.data.action ? eq(auditLogsTable.action, parsed.data.action) : undefined,
      ),
    )
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(parsed.data.limit);

  res.json(
    rows.map((r) => ({
      id: r.log.id,
      organizationId: r.log.organizationId,
      organization: r.organization,
      action: r.log.action,
      entity: r.log.entity,
      entityId: r.log.entityId,
      detail: r.log.detail,
      reason: r.log.reason,
      createdAt: r.log.createdAt,
    })),
  );
});

export default router;
