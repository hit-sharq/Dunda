import { NextResponse } from "next/server";
import { ZodError, type ZodType, type z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/client";
import { ApiError } from "@/lib/errors.server";
import { clerkClient } from "@clerk/nextjs/server";
import { scheduleDueJobs } from "@/lib/server/cron";

/**
 * Everything a request handler needs in order to act as somebody: who they are,
 * which club they belong to, what role they hold and what that role permits.
 *
 * Resolution order matters. A staff row is the record that ties a Clerk account to
 * an organization, so it is looked up first. A person with no staff row is not a
 * stranger — they may be the platform operator, whose access is by environment
 * allow-list rather than by club membership.
 */
export interface Session {
  clerkUserId: string;
  organizationId: string | null;
  staffId: string | null;
  branchId: string | null;
  roleId: string | null;
  roleName: string | null;
  permissions: Set<string>;
  isOwner: boolean;
  isOperator: boolean;
  suspended: { reason: string | null } | null;
}

/**
 * Platform operators are named by Clerk user id, never by role or by email.
 *
 * Both spellings of the variable are read because the deployment has used each of
 * them; an operator list that silently resolves to nobody would lock the platform
 * owner out of their own console.
 */
function operatorIds(): Set<string> {
  return new Set(
    `${process.env.PLATFORM_ADMIN_IDS ?? ""},${process.env.ADMIN_IDS ?? ""}`
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export async function resolveSession(): Promise<Session | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  let staff = await prisma.dunda_staff.findFirst({
    where: { clerk_user_id: userId, status: "ACTIVE" },
    include: {
      dunda_roles: {
        include: {
          dunda_role_permissions: { include: { dunda_permissions: true } },
        },
      },
      dunda_organizations: { select: { status: true, suspended_reason: true } },
    },
  });

  // A club adds its crew by name and email before anybody signs up, so a staff row
  // usually exists with no login attached. When that person does sign up, their
  // account claims the row on first sight rather than being asked to be added
  // again by somebody who has already added them.
  //
  // Matched on email and only where clerk_user_id is still null: a row that
  // already belongs to another login is never taken over, and the unique
  // constraint on clerk_user_id is what stops two accounts claiming one row.
  if (!staff) {
    const email = await accountEmail(userId, sessionClaims);
    if (email) {
      staff = await prisma.dunda_staff.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          clerk_user_id: null,
          status: "ACTIVE",
        },
        include: {
          dunda_roles: {
            include: {
              dunda_role_permissions: { include: { dunda_permissions: true } },
            },
          },
          dunda_organizations: {
            select: { status: true, suspended_reason: true },
          },
        },
      });

      if (staff) {
        try {
          await prisma.dunda_staff.update({
            where: { id: staff.id },
            data: { clerk_user_id: userId },
          });
          await prisma.dunda_audit_logs.create({
            data: {
              organization_id: staff.organization_id,
              branch_id: staff.branch_id,
              staff_id: staff.id,
              action: "LINK",
              entity: "staff",
              entity_id: staff.id,
              detail: `${staff.name} signed up and claimed their place on the roster`,
              previous_value: { clerkUserId: null },
              new_value: { clerkUserId: userId },
            },
          });
        } catch {
          // Another request claimed the same row first. That is a race with a
          // correct outcome, not a failure: the row is now linked and the next
          // request resolves this person normally.
          staff = null;
        }
      }
    }
  }

  if (!staff) {
    return {
      clerkUserId: userId,
      organizationId: null,
      staffId: null,
      branchId: null,
      roleId: null,
      roleName: null,
      permissions: new Set(),
      isOwner: false,
      isOperator: operatorIds().has(userId),
      suspended: null,
    };
  }

  const suspended =
    staff.dunda_organizations.status === "SUSPENDED"
      ? { reason: staff.dunda_organizations.suspended_reason }
      : null;
  const lockedOut = suspended !== null && !operatorIds().has(userId);

  const permissions = new Set(
    staff.dunda_roles.dunda_role_permissions.map((rp) => rp.dunda_permissions.name),
  );

  return {
    clerkUserId: userId,
    organizationId: lockedOut ? null : staff.organization_id,
    staffId: lockedOut ? null : staff.id,
    branchId: lockedOut ? null : staff.branch_id,
    roleId: lockedOut ? null : staff.role_id,
    roleName: lockedOut ? null : staff.dunda_roles.name,
    permissions: lockedOut ? new Set() : permissions,
    isOwner: lockedOut ? false : staff.dunda_roles.is_owner,
    isOperator: operatorIds().has(userId),
    suspended,
  };
}

/**
 * The email an account signs in with.
 *
 * A session token does not carry the email address, so
 * the account's own record on the provider is the only
 * place to read it from. That record is asked for only
 * when the first roster lookup found nobody — a linked
 * account never asks the provider again — and the
 * answer is kept briefly, because a console polls its
 * session on every screen.
 */
const emailCache = new Map<string, { email: string | null; until: number }>();
const EMAIL_CACHE_MS = 60_000;

async function accountEmail(
  userId: string,
  sessionClaims: unknown,
): Promise<string | null> {
  const claimed = (sessionClaims as { email?: string } | null)?.email;
  if (claimed) return claimed.toLowerCase();

  const cached = emailCache.get(userId);
  if (cached && cached.until > Date.now()) return cached.email;

  let email: string | null = null;
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    email = user.primaryEmailAddress?.emailAddress.toLowerCase() ?? null;
  } catch {
    // The provider is unreachable; the claim waits for
    // the next request rather than taking the sign-in
    // down with it.
  }
  emailCache.set(userId, { email, until: Date.now() + EMAIL_CACHE_MS });
  return email;
}

/** Sign-in failed, or the session is gone. */
export class Unauthenticated extends Error {}

/** Signed in, but not attached to any club. */
export class NotProvisioned extends Error {}

export class OrganizationSuspended extends Error {
  constructor(readonly reason: string | null) {
    super(
      reason
        ? `This club has been suspended: ${reason}`
        : "This club has been suspended.",
    );
    this.name = "OrganizationSuspended";
  }
}

/** Signed in and attached, but the role does not permit this action. */
export class Forbidden extends Error {
  constructor(readonly required: string) {
    super(`Your role does not include "${required}".`);
    this.name = "Forbidden";
  }
}

/**
 * Resolves the caller and asserts they belong to a club. Every club route starts
 * with this, so a route that forgets the assertion cannot accidentally serve the
 * platform console's data to a club, or one club's data to another.
 */
export async function requireSession(): Promise<Session> {
  const session = await resolveSession();
  if (!session) throw new Unauthenticated();
  if (session.suspended && !session.isOperator) {
    throw new OrganizationSuspended(session.suspended.reason);
  }
  if (!session.organizationId) throw new NotProvisioned();
  return session;
}

/** As above, but also asserts the named permission. */
export async function requirePermission(permission: string): Promise<Session> {
  const session = await requireSession();
  if (!session.permissions.has(permission)) throw new Forbidden(permission);
  return session;
}

/**
 * Asserts a fetched record belongs to the caller's club before it is used.
 *
 * Declared as an assertion so that after the call TypeScript knows the row is
 * present: a lookup that found nothing must not be carried on as if it had.
 */
export function assertSameOrg<T extends { organization_id: string }>(
  row: T | null | undefined,
  organizationId: string,
  what = "That record",
): asserts row is T {
  if (!row || row.organization_id !== organizationId) {
    throw new ApiError(404, `${what} no longer exists, or was deleted.`, {
      code: "NOT_FOUND",
    });
  }
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/**
 * Parses a JSON body against a schema. Nothing reaches a service unvalidated,
 * which is what keeps a caller from choosing its own totals or payment status.
 *
 * The return is the schema's *output* type rather than its input: a field with a
 * `.default()` is optional coming in and required coming out, and a handler must
 * see the value the schema promises rather than the one that might be missing.
 */
export async function parseBody<S extends ZodType>(
  schema: S,
  request: Request,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON", { code: "INVALID_BODY" });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(422, firstIssue(parsed.error), { code: "VALIDATION_FAILED" });
  }
  return parsed.data;
}

function firstIssue(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The request was not valid.";
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

/**
 * Wraps a handler so every failure leaves as the shape the client understands:
 * `{ error, code, required? }` with a status that matches the cause.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    // The in-app clock ticks on traffic: a job
    // that is due runs after the answer is sent.
    // It is asked before the handler, so the
    // claim is made while the request is still
    // open, and a clock that cannot read the
    // database never takes the request down.
    const request = args[0] as Request | undefined;
    if (request?.url) {
      await scheduleDueJobs(request.url).catch(() => undefined);
    }
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(error.body, { status: error.status });
  }
  if (error instanceof Unauthenticated) {
    return NextResponse.json(
      { error: "Sign in to continue.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }
  if (error instanceof NotProvisioned) {
    return NextResponse.json(
      {
        error: "Your account isn't set up yet.",
        code: "ACCOUNT_NOT_PROVISIONED",
      },
      { status: 403 },
    );
  }
  if (error instanceof OrganizationSuspended) {
    return NextResponse.json(
      {
        error: error.message,
        code: "ORGANIZATION_SUSPENDED",
        reason: error.reason,
      },
      { status: 403 },
    );
  }
  if (error instanceof Forbidden) {
    return NextResponse.json(
      {
        error: error.message,
        code: "FORBIDDEN",
        required: error.required,
      },
      { status: 403 },
    );
  }

  // A unique violation is a duplicate request, not a fault. The caller can retry
  // safely and will get the record that the first request created.
  if (isUniqueViolation(error)) {
    return NextResponse.json(
      { error: "That record already exists.", code: "DUPLICATE" },
      { status: 409 },
    );
  }

  console.error("[dunda] unhandled route failure", error);
  return NextResponse.json(
    { error: "The request could not be completed.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Appends the tenant scope to a where clause. Written as a function rather than
 * repeated inline so a new query has to be given an organizationId to compile.
 */
export function orgWhere<T extends Record<string, unknown>>(
  organizationId: string,
  where?: T,
): T & { organization_id: string } {
  return { ...where, organization_id: organizationId } as T & {
    organization_id: string;
  };
}
