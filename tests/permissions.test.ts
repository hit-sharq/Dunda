import { describe, expect, it } from "vitest";
import {
  canGrantRole,
  hasPermission,
  type StaffContext,
} from "../artifacts/api-server/src/lib/permissions";

/**
 * The grant boundary is the difference between a role system and a way for any
 * manager to mint an administrator. These cases are the security floor: nobody
 * below owner can reach owner, and nobody can reach past themselves.
 */
function ctx(overrides: Partial<StaffContext> = {}): StaffContext {
  return {
    staffId: "staff-1",
    organizationId: "org-1",
    branchId: "branch-1",
    clerkUserId: "user_1",
    role: "Test",
    permissions: new Set<string>(),
    isOwner: false,
    ...overrides,
  };
}

const OWNER_ROLE = { isOwner: true };
const ORDINARY_ROLE = { isOwner: false };

describe("role granting", () => {
  it("refuses a non-owner handing out the owner role", () => {
    for (const role of ["Waiter", "Cashier", "Branch Manager", "Floor Staff"]) {
      expect(canGrantRole(ctx({ role }), OWNER_ROLE)).toBe(false);
    }
  });

  it("allows an owner to hand out the owner role, which is how transfer works", () => {
    expect(canGrantRole(ctx({ isOwner: true }), OWNER_ROLE)).toBe(true);
  });

  it("allows anybody with the permission to hand out an ordinary role", () => {
    expect(canGrantRole(ctx({ role: "Branch Manager" }), ORDINARY_ROLE)).toBe(true);
  });

  it("refuses everything when there is no caller", () => {
    expect(canGrantRole(null, ORDINARY_ROLE)).toBe(false);
    expect(canGrantRole(undefined, OWNER_ROLE)).toBe(false);
  });
});

describe("permission checks", () => {
  it("grants everything to an owner regardless of the permission set", () => {
    // The owner role is the one that bypasses, and that is what makes a seeded
    // owner usable before the grant map has been built.
    expect(hasPermission(ctx({ isOwner: true }), "manage_branches")).toBe(true);
    expect(hasPermission(ctx({ isOwner: true }), "any_permission_at_all")).toBe(true);
  });

  it("grants only what the role actually holds", () => {
    const waiter = ctx({ role: "Waiter", permissions: new Set(["view_pos", "create_order"]) });
    expect(hasPermission(waiter, "view_pos")).toBe(true);
    expect(hasPermission(waiter, "manage_payments")).toBe(false);
  });

  it("grants nothing to a caller with no permissions", () => {
    expect(hasPermission(ctx({ role: "Nothing" }), "view_pos")).toBe(false);
  });
});
