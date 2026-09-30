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
import { getStaffContext } from "../lib/permissions";

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

export const tenantMiddleware: RequestHandler = async (req, res, next) => {
  const { userId, orgId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [staff] = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.clerkUserId, userId));

  if (staff) {
    const ctx = await getStaffContext(req);
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

  const [demoOrg] = await db
    .select()
    .from(organizationsTable)
    .orderBy(organizationsTable.createdAt)
    .limit(1);

  if (demoOrg) {
    const [branch] = await db
      .select()
      .from(branchesTable)
      .where(eq(branchesTable.organizationId, demoOrg.id));

    req.clerk = {
      organizationId: demoOrg.id,
      branchId: branch?.id ?? null,
      staffId: null,
      clerkUserId: null,
    };
    next();
    return;
  }

  req.clerk = {
    organizationId: "org-demo",
    branchId: "branch-nairobi",
    staffId: null,
    clerkUserId: null,
  };
  next();
};