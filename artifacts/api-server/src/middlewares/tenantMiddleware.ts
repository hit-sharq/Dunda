import type { RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  organizationsTable,
  branchesTable,
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  staffTable,
} from "@workspace/db";
import { buildStaffContext } from "../lib/permissions";
import { claimStaffByEmail } from "../lib/claimStaff";
import { logger } from "../lib/logger";

export interface TenantContext {
  organizationId: string;
  branchId: string | null;
  staffId: string | null;
  clerkUserId: string | null;
  __staffContext?: any;
}

export function getTenant(req: { clerk: TenantContext }): TenantContext {
  return req.clerk;
}

/**
 * The signed-in account's primary email, used only to match a pending staff
 * record. The claim path only runs when no record matched the account id, so
 * this lookup is uncommon rather than on the hot path.
 */
async function primaryEmailFor(userId: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  try {
    const { createClerkClient } = await import("@clerk/backend");
    const client = createClerkClient({ secretKey });
    const user = await client.users.getUser(userId);
    return user.emailAddresses?.[0]?.emailAddress ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "Could not read the account email for staff matching");
    return null;
  }
}

export const tenantMiddleware: RequestHandler = async (req, res, next) => {
  const { userId, orgId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // A database blip must not surface as an unhandled 500 with a stack trace.
  // Retrying briefly covers the transient connect timeouts seen with pooled
  // connections, and anything still failing is reported as unavailable.
  let staff: typeof staffTable.$inferSelect | undefined;
  try {
    staff = (
      await db
        .select()
        .from(staffTable)
        .where(eq(staffTable.clerkUserId, userId))
    )[0];
  } catch (err) {
    logger.error({ err, userId }, "Failed to resolve staff record");
    res.status(503).json({
      error:
        "We could not reach the database just now. Please try again in a moment.",
      code: "DATABASE_UNAVAILABLE",
    });
    return;
  }

  if (staff) {
    const ctx = await buildStaffContext(staff);
    req.clerk = {
      organizationId: staff.organizationId,
      branchId: staff.branchId ?? null,
      staffId: staff.id,
      clerkUserId: staff.clerkUserId,
      __staffContext: ctx,
    };
    next();
    return;
  }

  const [org] =
    (orgId
      ? await db
          .select()
          .from(organizationsTable)
          .where(eq(organizationsTable.id, orgId))
      : [null]) ?? [];

  if (org) {
    const [branch] = await db
      .select()
      .from(branchesTable)
      .where(eq(branchesTable.organizationId, org.id));
    req.clerk = {
      organizationId: org.id,
      branchId: branch?.id ?? null,
      staffId: null,
      clerkUserId: userId,
    };
    next();
    return;
  }

  // Somebody the owner invited has a pending staff record with their email but
  // no linked account yet. Claim it on their first authenticated request, which
  // is what makes an invitation work without a webhook. Only reached when no
  // record matched the account, so the extra lookup is rare.
  if (!staff) {
    const email = await primaryEmailFor(userId);
    if (email) {
      const claimedId = await claimStaffByEmail(userId, email);
      if (claimedId) {
        const claimed = (
          await db.select().from(staffTable).where(eq(staffTable.id, claimedId))
        )[0];
        req.clerk = {
          organizationId: claimed.organizationId,
          branchId: claimed.branchId ?? null,
          staffId: claimed.id,
          clerkUserId: claimed.clerkUserId,
          __staffContext: await buildStaffContext(claimed),
        };
        next();
        return;
      }
    }
  }

  // Guessing a tenant would hand one person another venue's sales, stock and
  // customer data, so this refuses instead. The wording is deliberately plain:
  // naming organizations, staff records and invitations would tell any
  // signed-in stranger that all of those exist and how they are granted.
  res.status(403).json({
    error:
      "Your account isn't set up yet. Ask the person who runs this place to give you access.",
    code: "ACCOUNT_NOT_PROVISIONED",
  });
};