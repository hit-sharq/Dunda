import { and, eq, isNull } from "drizzle-orm";
import {
  branchMembersTable,
  branchesTable,
  organizationMembersTable,
  staffTable,
} from "@workspace/db";
import { db } from "@workspace/db";
import { logAuditEntry } from "./auditLogger";
import { logger } from "./logger";

/**
 * Links a signed-in account to the staff record somebody created for them.
 *
 * The owner creates a staff row with a name, an email and a role, but the
 * person's Clerk identity does not exist yet. On their first authenticated
 * request, an unclaimed row with the same email is claimed.
 *
 * Two rules make this safe:
 *
 *  - Only rows with no linked account are ever matched. Once a row is claimed
 *    its email is inert, so signing up with a colleague's address cannot inherit
 *    their role.
 *  - If more than one unclaimed row matches, nothing is claimed. Ambiguity
 *    fails closed and is reported, rather than guessing which one was meant.
 */
export async function claimStaffByEmail(
  clerkUserId: string,
  email: string | null | undefined,
): Promise<string | null> {
  if (!email) return null;
  const address = email.trim().toLowerCase();
  if (!address) return null;

  const candidates = await db
    .select()
    .from(staffTable)
    .where(
      and(
        isNull(staffTable.clerkUserId),
        eq(staffTable.email, address),
      ),
    );

  if (candidates.length > 1) {
    // Two pending records for the same address: an owner mistake. Claim neither.
    logger.warn(
      { email: address, count: candidates.length },
      "Multiple unclaimed staff records match this email; refusing to claim",
    );
    return null;
  }

  const record = candidates[0];
  if (!record) return null;

  const [claimed] = await db
    .update(staffTable)
    .set({ clerkUserId, status: "ACTIVE", updatedAt: new Date() })
    .where(
      and(eq(staffTable.id, record.id), isNull(staffTable.clerkUserId)),
    )
    .returning({ id: staffTable.id });

  // Another request may have claimed it first; the conditional update above
  // returning nothing means somebody else got there.
  if (!claimed) {
    const [existing] = await db
      .select({ id: staffTable.id })
      .from(staffTable)
      .where(eq(staffTable.clerkUserId, clerkUserId));
    return existing?.id ?? null;
  }

  const [branch] = record.branchId
    ? [{ id: record.branchId }]
    : await db
        .select({ id: branchesTable.id })
        .from(branchesTable)
        .where(eq(branchesTable.organizationId, record.organizationId))
        .limit(1);

  await db
    .insert(organizationMembersTable)
    .values({
      id: `om-${record.id}`,
      organizationId: record.organizationId,
      clerkUserId,
      roleId: record.roleId,
    })
    .onConflictDoNothing();

  if (branch?.id) {
    await db
      .insert(branchMembersTable)
      .values({
        id: `bm-${record.id}`,
        organizationId: record.organizationId,
        branchId: branch.id,
        clerkUserId,
        roleId: record.roleId,
      })
      .onConflictDoNothing();
  }

  // This event is the one worth reviewing: an account just acquired a role.
  await logAuditEntry({
    organizationId: record.organizationId,
    branchId: record.branchId,
    staffId: record.id,
    action: "UPDATE",
    entity: "STAFF",
    entityId: record.id,
    detail: `${record.name} signed in and was linked to their pending staff record by email match.`,
  });

  logger.info(
    { staffId: record.id, organizationId: record.organizationId },
    "Claimed pending staff record by email",
  );

  return record.id;
}
