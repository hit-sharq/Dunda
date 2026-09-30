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
    }
  }
}

export {};