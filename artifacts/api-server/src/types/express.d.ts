import type { StaffContext } from "../lib/permissions";

declare global {
  namespace Express {
    interface Request {
      clerk: {
        organizationId: string;
        branchId: string | null;
        staffId: string | null;
        clerkUserId: string | null;
        __staffContext?: StaffContext;
      };
      /** Set only by the platform admin guard, never by tenant resolution. */
      /** Identified by the account id alone; there is no separate admin row. */
      platformAdmin?: { id: string; clerkUserId: string };
    }
  }
}

export {};
