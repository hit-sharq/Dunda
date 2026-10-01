import type { RequestHandler } from "express";
import { getAuth } from "@clerk/express";

/**
 * Platform administration.
 *
 * The administrators are named by id in the environment rather than in a table,
 * on purpose. A permission could reach a club owner through some future role
 * management path, and a table is only ever as safe as the code that writes it.
 * The environment is outside the application's reach: no route, no migration and
 * no bug can add a name to it.
 *
 * Ids only. A display name would be a second thing to keep in step with the
 * first, and it is only ever shown to the person who already owns the list.
 *
 *   PLATFORM_ADMIN_IDS=user_2abc...,user_2def...
 *
 * The cost is that granting administrator means changing the environment and
 * redeploying, which is correct for a list of one to three people.
 */

export interface PlatformAdmin {
  clerkUserId: string;
}

let cachedIds: string[] | null = null;
let cachedAt = 0;
const CACHE_MS = 30_000;

function readConfig(): string[] {
  if (cachedIds && Date.now() - cachedAt < CACHE_MS) return cachedIds;
  const ids = (process.env.PLATFORM_ADMIN_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  cachedIds = ids;
  cachedAt = Date.now();
  return ids;
}

/** True when the environment names this account as an administrator. */
export function isPlatformAdmin(clerkUserId: string | null | undefined): boolean {
  if (!clerkUserId) return false;
  return readConfig().includes(clerkUserId);
}

export function platformAdminList(): PlatformAdmin[] {
  return readConfig().map((id) => ({ clerkUserId: id }));
}

/** For tests, so one case cannot leak its configuration into the next. */
export function _resetPlatformAdminCache(): void {
  cachedIds = null;
  cachedAt = 0;
}

export const requirePlatformAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (!isPlatformAdmin(userId)) {
    // On the club app's domain a refusal here would confirm a hidden surface
    // exists behind this path. Answering exactly as any unknown path does means a
    // caller learns nothing about what is or is not mounted.
    res.status(404).json({ error: "Not found" });
    return;
  }

  req.platformAdmin = { id: userId, clerkUserId: userId };
  next();
};
