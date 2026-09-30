import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  CreateShiftBody,
  CreateShiftResponse,
  CreateStaffBody,
  CreateStaffResponse,
  GetStaffMemberParams,
  GetStaffMemberResponse,
  GetStaffResponse,
  GetShiftsResponse,
  GetStaffResponseItem,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  rolesTable,
  staffTable,
  staffShiftsTable,
  branchesTable,
  branchMembersTable,
  organizationMembersTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import { canGrantRole, type StaffContext } from "../lib/permissions";
import { BranchScopeError, requireBranchScope } from "../lib/branchScope";
import { logAuditEntry } from "../lib/auditLogger";

const router: IRouter = Router();

/**
 * There is exactly one owner, and changing who holds it is a deliberate
 * transfer rather than something that happens as a side effect of inviting
 * somebody. This keeps "promote a colleague" from silently producing two owners
 * with identical authority and no record of which one decided.
 */
async function refuseIfOwnerExists(
  res: any,
  organizationId: string,
  action: string,
  ignoreStaffId?: string | null,
): Promise<boolean> {
  const ownerRole = (
    await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.isOwner, true))
  )[0];
  if (!ownerRole) return false;

  const existing = await db
    .select({ id: staffTable.id })
    .from(staffTable)
    .where(
      and(
        eq(staffTable.organizationId, organizationId),
        eq(staffTable.roleId, ownerRole.id),
      ),
    );
  const claimed = existing.filter((s) => s.id !== ignoreStaffId);
  if (!claimed.length) return false;

  res.status(409).json({
    error:
      "This organization already has an owner. Transfer ownership to them instead of creating a second one.",
    code: "OWNER_ALREADY_EXISTS",
  });
  return true;
}

router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.organizationId, tenant.organizationId))
    .orderBy(staffTable.name);

  const response = await Promise.all(
    rows.map(async (s) => {
      const [role] = await db
        .select()
        .from(rolesTable)
        .where(eq(rolesTable.id, s.roleId));
      const item = GetStaffResponseItem.parse({
        id: s.id,
        clerkUserId: s.clerkUserId,
        name: s.name,
        email: s.email ?? null,
        phone: s.phone ?? null,
        role: role?.name ?? null,
        roleId: s.roleId,
        status: s.status as "ACTIVE" | "INACTIVE",
        branchId: s.branchId,
        createdAt: s.createdAt,
      });
      return item;
    }),
  );
  res.json(GetStaffResponse.parse(response));
});

router.post("/", async (req, res): Promise<void> => {
  const ctx = req.clerk?.__staffContext as StaffContext | undefined;
  if (!ctx || (!ctx.isOwner && !ctx.permissions.has("manage_staff"))) {
    res.status(403).json({
        error: "You do not have permission to perform this action.",
        code: "INSUFFICIENT_PERMISSION",
        required: "manage_staff",
      });
    return;
  }
  const tenant = getTenant(req);
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Only an owner may hand out the owner role. Without this a Branch Manager
  // could create an Owner and pass the account to a colleague.
  const [grantRole] = await db
    .select({ id: rolesTable.id, isOwner: rolesTable.isOwner, name: rolesTable.name })
    .from(rolesTable)
    .where(eq(rolesTable.id, parsed.data.roleId));
  if (!grantRole) {
    res.status(400).json({ error: "That role does not exist." });
    return;
  }
  if (!canGrantRole(ctx, grantRole)) {
    res.status(403).json({
      error: `You cannot grant the ${grantRole.name} role.`,
      code: "CANNOT_GRANT_ROLE",
      required: grantRole.name,
    });
    return;
  }
  if (grantRole.isOwner) {
    const refusal = await refuseIfOwnerExists(res, tenant.organizationId, "create another owner");
    if (refusal) return;
  }

  const id = `staff-${Date.now()}`;
  // A staff record is created before the invite is accepted, so the external
  // identity may be unknown. It stays null until the person signs in; it is
  // never filled with a placeholder that looks like a real Clerk id.
  const clerkUserId = parsed.data.clerkUserId ?? null;

  const [staff] = await db
    .insert(staffTable)
    .values({
      id,
      organizationId: tenant.organizationId,
      branchId: parsed.data.branchId ?? tenant.branchId ?? null,
      clerkUserId,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      roleId: parsed.data.roleId,
    })
    .returning();

  // Membership rows are keyed by the external identity, so they can only exist
  // once the account is known. An unclaimed invite is a staff record with no
  // membership yet.
  if (staff.clerkUserId) {
    await db.insert(organizationMembersTable).values({
      id: `om-${id}`,
      organizationId: tenant.organizationId,
      clerkUserId: staff.clerkUserId,
      roleId: parsed.data.roleId,
    });
    if (staff.branchId) {
      await db.insert(branchMembersTable).values({
        id: `bm-${id}`,
        organizationId: tenant.organizationId,
        branchId: staff.branchId,
        clerkUserId: staff.clerkUserId,
        roleId: parsed.data.roleId,
      });
    }
  }

  await logAuditEntry({
    organizationId: tenant.organizationId,
    branchId: staff.branchId,
    staffId: tenant.staffId,
    action: "CREATE",
    entity: "STAFF",
    entityId: staff.id,
    detail: `Invited ${staff.name} as role ${parsed.data.roleId}`,
  });

  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, staff.roleId));
  const response = {
    id: staff.id,
    clerkUserId: staff.clerkUserId,
    name: staff.name,
    email: staff.email ?? null,
    phone: staff.phone ?? null,
    role: role?.name ?? null,
    roleId: staff.roleId,
    status: staff.status as "ACTIVE" | "INACTIVE",
    branchId: staff.branchId,
    createdAt: staff.createdAt,
  };
  res.status(201).json(CreateStaffResponse.parse(response));
});

router.get("/:staffId", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetStaffMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [staff] = await db
    .select()
    .from(staffTable)
    .where(
      and(
        eq(staffTable.id, params.data.staffId),
        eq(staffTable.organizationId, tenant.organizationId),
      ),
    );
  if (!staff) {
    res.status(404).json({ error: "Staff not found" });
    return;
  }
  const [role] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.id, staff.roleId));
  res.json(
    GetStaffMemberResponse.parse({
      id: staff.id,
      clerkUserId: staff.clerkUserId,
      name: staff.name,
      email: staff.email ?? null,
      phone: staff.phone ?? null,
      role: role?.name ?? null,
      roleId: staff.roleId,
      status: staff.status as "ACTIVE" | "INACTIVE",
      branchId: staff.branchId,
      createdAt: staff.createdAt,
    }),
  );
});

router.patch("/:staffId", async (req, res): Promise<void> => {
  const ctx = req.clerk?.__staffContext as StaffContext | undefined;
  if (!ctx || (!ctx.isOwner && !ctx.permissions.has("manage_staff"))) {
    res.status(403).json({
        error: "You do not have permission to perform this action.",
        code: "INSUFFICIENT_PERMISSION",
        required: "manage_staff",
      });
    return;
  }
  const tenant = getTenant(req);
  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().nullable().optional(),
      roleId: z.string().min(1).optional(),
      branchId: z.string().nullable().optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(staffTable)
    .where(
      and(
        eq(staffTable.id, req.params.staffId),
        eq(staffTable.organizationId, tenant.organizationId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }

  // Promoting someone is a grant, and obeys the same rank rule as creating one.
  if (parsed.data.roleId && parsed.data.roleId !== existing.roleId) {
    const [targetRole] = await db
      .select({ isOwner: rolesTable.isOwner, name: rolesTable.name })
      .from(rolesTable)
      .where(eq(rolesTable.id, parsed.data.roleId));
    if (!targetRole) {
      res.status(400).json({ error: "That role does not exist." });
      return;
    }
    if (!canGrantRole(ctx, targetRole)) {
      res.status(403).json({
        error: `You cannot grant the ${targetRole.name} role.`,
        code: "CANNOT_GRANT_ROLE",
        required: targetRole.name,
      });
      return;
    }
    if (targetRole.isOwner) {
      const refusal = await refuseIfOwnerExists(
        res,
        tenant.organizationId,
        "promote somebody to owner",
        existing.clerkUserId,
      );
      if (refusal) return;
    }
  }

  // A branch manager may only move or change people inside their own branch.
  if (
    parsed.data.branchId &&
    tenant.branchId &&
    parsed.data.branchId !== tenant.branchId &&
    !ctx.isOwner &&
    !ctx.permissions.has("manage_branches")
  ) {
    res.status(403).json({ error: "You can only manage staff in your assigned branch" });
    return;
  }

  const [row] = await db
    .update(staffTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(staffTable.id, existing.id))
    .returning();

  if (parsed.data.roleId || parsed.data.branchId) {
    const patch: Record<string, string> = {};
    if (parsed.data.roleId) patch.roleId = parsed.data.roleId;
    if (parsed.data.branchId !== undefined && parsed.data.branchId !== null) {
      patch.branchId = parsed.data.branchId;
    }
    // An unclaimed invite has no membership rows to keep in step.
    if (existing.clerkUserId && (parsed.data.roleId || parsed.data.branchId !== undefined)) {
      await db
        .update(branchMembersTable)
        .set(patch)
        .where(eq(branchMembersTable.clerkUserId, existing.clerkUserId));
      await db
        .update(organizationMembersTable)
        .set(parsed.data.roleId ? { roleId: parsed.data.roleId } : {})
        .where(eq(organizationMembersTable.clerkUserId, existing.clerkUserId));
    }
  }
  if (parsed.data.status && existing.clerkUserId) {
    await db
      .update(branchMembersTable)
      .set({ status: parsed.data.status })
      .where(eq(branchMembersTable.clerkUserId, existing.clerkUserId));
  }

  await logAuditEntry({
    organizationId: tenant.organizationId,
    branchId: row.branchId,
    staffId: tenant.staffId,
    action: "UPDATE",
    entity: "STAFF",
    entityId: row.id,
    detail: `Updated ${row.name}${parsed.data.status ? ` (${parsed.data.status})` : ""}`,
  });

  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, row.roleId));
  res.json({
    id: row.id,
    clerkUserId: row.clerkUserId,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: role?.name ?? null,
    roleId: row.roleId,
    status: row.status,
    branchId: row.branchId,
    createdAt: row.createdAt,
  });
});

router.get("/shifts", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(staffShiftsTable)
    .where(eq(staffShiftsTable.organizationId, tenant.organizationId))
    .orderBy(staffShiftsTable.createdAt);

  const response = await Promise.all(
    rows.map(async (s) => {
      const [staff] = await db
        .select()
        .from(staffTable)
        .where(eq(staffTable.id, s.staffId));
      return {
        id: s.id,
        staffId: s.staffId,
        staffName: staff?.name ?? null,
        clockInAt: s.clockInAt?.toISOString() ?? null,
        clockOutAt: s.clockOutAt?.toISOString() ?? null,
        breakStartAt: s.breakStartAt?.toISOString() ?? null,
        breakEndAt: s.breakEndAt?.toISOString() ?? null,
        status: s.status as "DRAFT" | "RUNNING" | "CLOSED",
        notes: s.notes ?? null,
        createdAt: s.createdAt,
      };
    }),
  );
  res.json(GetShiftsResponse.parse(response));
});

router.post("/shifts", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = CreateShiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let branchId: string;
  try {
    branchId = requireBranchScope(tenant, parsed.data.branchId);
  } catch (err) {
    res.status((err as BranchScopeError).status ?? 400).json({ error: (err as Error).message });
    return;
  }
  const id = `shift-${Date.now()}`;
  const [shift] = await db
    .insert(staffShiftsTable)
    .values({
      id,
      organizationId: tenant.organizationId,
      branchId,
      staffId: parsed.data.staffId,
      clockInAt: new Date(),
      status: "RUNNING",
      notes: parsed.data.notes ?? null,
    })
    .returning();

  const [staff] = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.id, shift.staffId));

  res.status(201).json(
    CreateShiftResponse.parse({
      id: shift.id,
      staffId: shift.staffId,
      staffName: staff?.name ?? null,
      clockInAt: shift.clockInAt?.toISOString() ?? null,
      clockOutAt: shift.clockOutAt?.toISOString() ?? null,
      breakStartAt: shift.breakStartAt?.toISOString() ?? null,
      breakEndAt: shift.breakEndAt?.toISOString() ?? null,
      status: shift.status as "DRAFT" | "RUNNING" | "CLOSED",
      notes: shift.notes ?? null,
      createdAt: shift.createdAt,
    }),
  );
});

router.post("/shifts/:shiftId/clock", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = z
    .object({ action: z.enum(["clock_in", "clock_out", "break_start", "break_end"]) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [shift] = await db
    .select()
    .from(staffShiftsTable)
    .where(
      and(
        eq(staffShiftsTable.id, req.params.shiftId),
        eq(staffShiftsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!shift) {
    res.status(404).json({ error: "Shift not found" });
    return;
  }
  // Staff may only record their own shift.
  if (shift.staffId !== tenant.staffId) {
    const ctx = req.clerk?.__staffContext as
      | { isOwner: boolean; permissions: Set<string> }
      | undefined;
    if (!ctx || (!ctx.isOwner && !ctx.permissions.has("manage_staff"))) {
      res.status(403).json({ error: "You can only record your own shift" });
      return;
    }
  }

  const now = new Date();
  const patch =
    parsed.data.action === "clock_in"
      ? { clockInAt: now, status: "RUNNING" }
      : parsed.data.action === "clock_out"
        ? { clockOutAt: now, status: "CLOSED" }
        : parsed.data.action === "break_start"
          ? { breakStartAt: now }
          : { breakEndAt: now };

  const [row] = await db
    .update(staffShiftsTable)
    .set(patch)
    .where(eq(staffShiftsTable.id, shift.id))
    .returning();

  const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, row.staffId));
  res.json({
    id: row.id,
    staffId: row.staffId,
    staffName: staff?.name ?? null,
    clockInAt: row.clockInAt?.toISOString() ?? null,
    clockOutAt: row.clockOutAt?.toISOString() ?? null,
    breakStartAt: row.breakStartAt?.toISOString() ?? null,
    breakEndAt: row.breakEndAt?.toISOString() ?? null,
    status: row.status,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
  });
});

/**
 * Hands ownership to another staff member.
 *
 * The single-owner rule above means nobody can become a second owner by being
 * invited or promoted. This is the one deliberate path, and it demotes the
 * current owner rather than leaving two people with identical authority.
 */
router.post("/:staffId/transfer-ownership", async (req, res): Promise<void> => {
  const ctx = req.clerk?.__staffContext as StaffContext | undefined;
  if (!ctx || !ctx.isOwner) {
    res.status(403).json({
      error: "Only the current owner can transfer ownership.",
      code: "OWNER_ONLY",
    });
    return;
  }
  const tenant = getTenant(req);

  const target = (
    await db
      .select()
      .from(staffTable)
      .where(
        and(
          eq(staffTable.id, req.params.staffId),
          eq(staffTable.organizationId, tenant.organizationId),
        ),
      )
  )[0];
  if (!target) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  // Ownership can only be handed to somebody who can actually sign in.
  if (!target.clerkUserId) {
    res.status(409).json({
      error:
        "That person has not accepted their invite yet, so they cannot take ownership. Ask them to sign in first.",
      code: "STAFF_NOT_LINKED",
    });
    return;
  }
  if (target.clerkUserId === tenant.clerkUserId) {
    res.status(400).json({ error: "You already own this organization." });
    return;
  }

  const [ownerRole, administratorRole] = await Promise.all([
    db.select().from(rolesTable).where(eq(rolesTable.isOwner, true)).then((r) => r[0]),
    db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, "Administrator"))
      .then((r) => r[0]),
  ]);
  if (!ownerRole) {
    res.status(500).json({ error: "This organization has no owner role configured." });
    return;
  }
  if (!administratorRole) {
    res.status(500).json({
      error: "This organization has no Administrator role to demote the owner into.",
    });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const previousOwner = (
      await tx
        .select()
        .from(staffTable)
        .where(
          and(
            eq(staffTable.organizationId, tenant.organizationId),
            eq(staffTable.roleId, ownerRole.id),
          ),
        )
    )[0];

    const [promoted] = await tx
      .update(staffTable)
      .set({ roleId: ownerRole.id, updatedAt: new Date() })
      .where(eq(staffTable.id, target.id))
      .returning();

    if (previousOwner) {
      await tx
        .update(staffTable)
        .set({ roleId: administratorRole.id, updatedAt: new Date() })
        .where(eq(staffTable.id, previousOwner.id));
    }

    // Keep organization membership in step with the staff rows. A staff record
    // with no linked account has no membership row to update.
    const moves: Array<{ clerkUserId: string; roleId: string }> = [
      ...(target.clerkUserId
        ? [{ clerkUserId: target.clerkUserId, roleId: ownerRole.id }]
        : []),
      ...(previousOwner?.clerkUserId
        ? [{ clerkUserId: previousOwner.clerkUserId, roleId: administratorRole.id }]
        : []),
    ];
    for (const move of moves) {
      await tx
        .update(organizationMembersTable)
        .set({ roleId: move.roleId })
        .where(
          and(
            eq(organizationMembersTable.organizationId, tenant.organizationId),
            eq(organizationMembersTable.clerkUserId, move.clerkUserId),
          ),
        );
    }

    return { promoted, previousOwner };
  });

  await logAuditEntry({
    organizationId: tenant.organizationId,
    branchId: target.branchId,
    staffId: tenant.staffId,
    action: "UPDATE",
    entity: "OWNERSHIP",
    entityId: target.id,
    detail: `Ownership transferred to ${target.name}. The previous owner was demoted to Administrator.`,
  });

  res.json({
    owner: {
      id: result.promoted.id,
      name: result.promoted.name,
      email: result.promoted.email ?? null,
    },
    previousOwner: result.previousOwner
      ? { id: result.previousOwner.id, name: result.previousOwner.name }
      : null,
  });
});

export default router;