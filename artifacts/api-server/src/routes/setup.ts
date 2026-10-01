import { Router, type IRouter } from "express";
import { asc, and, eq, isNull } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  auditLogsTable,
  branchMembersTable,
  branchesTable,
  organizationMembersTable,
  rolesTable,
  setupTokenAttemptsTable,
  setupTokensTable,
  staffTable,
} from "@workspace/db";
import { verifyToken } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Claiming the first owner.
 *
 * Signing in alone never grants anything. A setup token, issued out of band and
 * stored only as a digest, is what binds an authenticated account to the owner
 * role.
 */

/** A wrong code is the one thing worth guessing here, so it is rate limited. */
const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Wait a few minutes and try again." },
});

const ClaimBody = z.object({ token: z.string().min(8) });

/** Whether an organization still has nobody signed in as its owner. */
router.get("/status", async (_req, res): Promise<void> => {
  const [ownerRole] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.isOwner, true))
    .orderBy(asc(rolesTable.sortOrder))
    .limit(1);
  if (!ownerRole) {
    res.json({ claimable: false, reason: "NO_OWNER_ROLE" });
    return;
  }

  const orgId = process.env.SETUP_ORGANIZATION_ID ?? null;
  const filters = [eq(staffTable.roleId, ownerRole.id)];
  if (orgId) filters.push(eq(staffTable.organizationId, orgId));

  const [owner] = await db
    .select({ id: staffTable.id, clerkUserId: staffTable.clerkUserId })
    .from(staffTable)
    .where(and(...filters))
    .limit(1);

  // Claimable only while nobody is actually signed in as owner. An owner row
  // with no linked account is a placeholder, not an owner.
  res.json({
    claimable: !owner || !owner.clerkUserId,
    reason: owner && owner.clerkUserId ? "ALREADY_CLAIMED" : null,
  });
});

router.post("/claim", claimLimiter, async (req, res): Promise<void> => {
  const parsed = ClaimBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the setup token you were given." });
    return;
  }

  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in first, then enter the token." });
    return;
  }

  const now = new Date();
  const candidates = await db
    .select()
    .from(setupTokensTable)
    .where(
      and(
        eq(setupTokensTable.purpose, "CLAIM_OWNERSHIP"),
        isNull(setupTokensTable.consumedAt),
      ),
    );

  const match = candidates.find((t) => verifyToken(parsed.data.token, t.tokenHash));
  if (!match) {
    // A failure is recorded so a brute-force attempt is visible afterwards.
    if (candidates[0]) {
      await db.insert(setupTokenAttemptsTable).values({
        id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tokenId: candidates[0].id,
        clerkUserId: userId,
        succeeded: false,
        reason: "NO_MATCH",
      });
    }
    res.status(400).json({ error: "That token is not valid." });
    return;
  }

  if (match.expiresAt < now) {
    await db.insert(setupTokenAttemptsTable).values({
      id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tokenId: match.id,
      clerkUserId: userId,
      succeeded: false,
      reason: "EXPIRED",
    });
    res.status(400).json({ error: "That token has expired. Ask for a new one." });
    return;
  }

  const [ownerRole] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.isOwner, true))
    .orderBy(asc(rolesTable.sortOrder))
    .limit(1);
  if (!ownerRole) {
    res.status(500).json({ error: "This deployment has no owner role configured." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Claim once. The conditional update is what makes a replay a no-op
      // rather than a second owner.
      const [consumed] = await tx
        .update(setupTokensTable)
        .set({ consumedAt: now, consumedByClerkUserId: userId })
        .where(
          and(
            eq(setupTokensTable.id, match.id),
            isNull(setupTokensTable.consumedAt),
          ),
        )
        .returning({ id: setupTokensTable.id });
      if (!consumed) throw new Error("TOKEN_ALREADY_USED");

      const [existingOwner] = await tx
        .select()
        .from(staffTable)
        .where(
          and(
            eq(staffTable.organizationId, match.organizationId),
            eq(staffTable.roleId, ownerRole.id),
            eq(staffTable.clerkUserId, userId),
          ),
        );
      if (existingOwner) throw new Error("ALREADY_OWNER");

      // The owner role may already have a placeholder staff row from the seed.
      const [ownerRow] = await tx
        .select()
        .from(staffTable)
        .where(
          and(
            eq(staffTable.organizationId, match.organizationId),
            eq(staffTable.roleId, ownerRole.id),
          ),
        );

      const [branch] = await tx
        .select({ id: branchesTable.id })
        .from(branchesTable)
        .where(eq(branchesTable.organizationId, match.organizationId))
        .limit(1);

      if (ownerRow) {
        await tx
          .update(staffTable)
          .set({ clerkUserId: userId, branchId: ownerRow.branchId ?? branch?.id ?? null, updatedAt: now })
          .where(eq(staffTable.id, ownerRow.id));
      } else {
        await tx.insert(staffTable).values({
          id: `staff-owner-${Date.now()}`,
          organizationId: match.organizationId,
          branchId: branch?.id ?? null,
          clerkUserId: userId,
          name: "Owner",
          email: null,
          phone: null,
          roleId: ownerRole.id,
          status: "ACTIVE",
        });
      }

      await tx.insert(organizationMembersTable).values({
        id: `om-owner-${Date.now()}`,
        organizationId: match.organizationId,
        clerkUserId: userId,
        roleId: ownerRole.id,
      });
      if (branch) {
        await tx.insert(branchMembersTable).values({
          id: `bm-owner-${Date.now()}`,
          organizationId: match.organizationId,
          branchId: branch.id,
          clerkUserId: userId,
          roleId: ownerRole.id,
        });
      }

      await tx.insert(auditLogsTable).values({
        id: `audit-claim-${Date.now()}`,
        organizationId: match.organizationId,
        branchId: branch?.id ?? null,
        staffId: null,
        action: "CREATE",
        entity: "OWNERSHIP",
        entityId: match.organizationId,
        detail: `Ownership claimed with a single-use setup token.`,
      });

      return { organizationId: match.organizationId, role: ownerRole.name };
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "UNKNOWN";
    logger.warn({ reason, userId }, "Ownership claim failed");
    if (reason === "TOKEN_ALREADY_USED") {
      res.status(409).json({ error: "That token has already been used." });
      return;
    }
    if (reason === "ALREADY_OWNER") {
      res.status(409).json({ error: "You already own this organization." });
      return;
    }
    res.status(500).json({ error: "Could not complete the claim." });
  }
});

export default router;
