import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { permissionsTable, rolePermissionsTable, rolesTable, staffTable } from "@workspace/db";

export type PermissionKey =
  | "view_pos"
  | "create_order"
  | "modify_order"
  | "update_ticket"
  | "apply_discount"
  | "void_order"
  | "refund_payment"
  | "close_order"
  | "view_inventory"
  | "adjust_inventory"
  | "approve_transfer"
  | "manage_staff"
  | "manage_products"
  | "manage_prices"
  | "manage_events"
  | "manage_reservations"
  | "view_reports"
  | "manage_branches"
  | "manage_floor"
  | "view_audit_logs"
  | "manage_roles"
  | "manage_vip"
  | "manage_payments"
  | "clock_shift";

export interface StaffContext {
  staffId: string | null;
  organizationId: string;
  branchId: string | null;
  clerkUserId: string | null;
  role: string | null;
  permissions: Set<string>;
  isOwner: boolean;
}

export async function getStaffContext(req: any): Promise<StaffContext> {
  const clerk: any = req.clerk;
  if (!clerk) {
    return {
      staffId: null,
      organizationId: "",
      branchId: null,
      clerkUserId: null,
      role: null,
      permissions: new Set(),
      isOwner: false,
    };
  }

  if (!clerk.staffId) {
    return {
      staffId: null,
      organizationId: clerk.organizationId,
      branchId: clerk.branchId,
      clerkUserId: clerk.clerkUserId,
      role: null,
      permissions: new Set(),
      isOwner: false,
    };
  }

  const [staff] = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.id, clerk.staffId));

  if (!staff) {
    return {
      staffId: null,
      organizationId: clerk.organizationId,
      branchId: clerk.branchId,
      clerkUserId: clerk.clerkUserId,
      role: null,
      permissions: new Set(),
      isOwner: false,
    };
  }

  const [role] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.id, staff.roleId));

  // A role's owner status is stored on the role. Matching on the display name
  // meant renaming a role silently stripped owner access, and naming any other
  // role "Owner" granted full access.
  const isOwner = role?.isOwner ?? false;

  const permRows = await db
    .select({ name: permissionsTable.name })
    .from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(eq(rolePermissionsTable.roleId, staff.roleId));

  return {
    staffId: staff.id,
    organizationId: staff.organizationId,
    branchId: staff.branchId,
    clerkUserId: staff.clerkUserId,
    role: role?.name ?? null,
    permissions: new Set(permRows.map((p) => p.name)),
    isOwner,
  };
}

export function hasPermission(ctx: StaffContext, permission: PermissionKey): boolean {
  if (ctx.isOwner) return true;
  return ctx.permissions.has(permission);
}

export function requirePermission(permission: PermissionKey) {
  return (req: any, res: any, next: any) => {
    const ctx: StaffContext = req.clerk?.__staffContext;
    if (!ctx) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!hasPermission(ctx, permission)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export function setStaffContext(req: any, ctx: StaffContext): void {
  if (!req.clerk) req.clerk = {};
  req.clerk.__staffContext = ctx;
}