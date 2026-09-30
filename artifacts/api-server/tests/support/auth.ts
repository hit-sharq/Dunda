import { vi } from "vitest";

/**
 * Stands in for the signed-in account.
 *
 * The real middleware reads a verified Clerk token off the request. Tests set
 * who is signed in here, so the tenant, permission and ownership logic that
 * every route depends on runs for real, with only the identity check stubbed.
 */
let currentUserId: string | null = null;
let currentOrgId: string | null = null;

export function signInAs(userId: string | null, orgId: string | null = null): void {
  currentUserId = userId;
  currentOrgId = orgId;
}

export function signOut(): void {
  currentUserId = null;
  currentOrgId = null;
}

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: currentUserId, orgId: currentOrgId }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
  requireAuth: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: { getUser: async () => ({ emailAddresses: [] }) },
  }),
  verifyToken: async () => ({ userId: currentUserId }),
}));

// The app installs a request logger from the real pino instance, and pino-http
// reads that instance's levels. Mocking it would break the middleware, so the
// log level is turned down through the environment instead.
// Left at debug while diagnosing, since the suite runs without a terminal.
process.env.LOG_LEVEL = "silent";

