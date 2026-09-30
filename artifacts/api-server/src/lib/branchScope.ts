/**
 * Branch resolution for writes.
 *
 * A record is only ever created against a branch the caller is actually
 * scoped to. Previously these paths fell back to a hardcoded "branch-nairobi",
 * which would silently attach real orders, events and shifts to a branch that
 * may not exist for this organization.
 */
export class BranchScopeError extends Error {
  readonly status = 400;
  constructor() {
    super(
      "You are not assigned to a branch yet, so this record cannot be created. Ask an organization owner to assign you to a branch.",
    );
    this.name = "BranchScopeError";
  }
}

/**
 * Returns the branch to write against, preferring an explicit request value
 * that is verified elsewhere, and otherwise the caller's own branch.
 *
 * Throws BranchScopeError rather than inventing an id.
 */
export function requireBranchScope(
  tenant: { branchId: string | null },
  requested?: string | null,
): string {
  const branchId = requested ?? tenant.branchId;
  if (!branchId) throw new BranchScopeError();
  return branchId;
}
