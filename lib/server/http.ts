import { NextResponse } from "next/server";
import { ZodError, type ZodType, type z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/client";
import { ApiError } from "@/lib/errors.server";
import { isModuleEnabled } from "./settings";
import { clerkClient } from "@clerk/nextjs/server";
import { scheduleDueJobs } from "@/lib/server/cron";


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

  
  
  
  
  
  
  
  
  if (!staff) {
    const email = await accountEmail(userId, sessionClaims);
    // Do not auto-link platform operators to club staff records by email.
    // This prevents club managers from "claiming" an operator's account
    // by inviting their email to a club, which would demote them from
    // platform operator to club staff on next sign-in.
    if (email && !operatorIds().has(userId)) {
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
    
    
    
  }
  emailCache.set(userId, { email, until: Date.now() + EMAIL_CACHE_MS });
  return email;
}


export class Unauthenticated extends Error {}


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


export class ModuleNotInPlan extends Error {
  constructor(readonly module: string, readonly planName: string | null) {
    super(`Your plan does not include the ${module} module.`);
    this.name = "ModuleNotInPlan";
  }
}


export class ModuleDisabled extends Error {
  constructor(readonly module: string) {
    super(`The ${module} module has been switched off for this club.`);
    this.name = "ModuleDisabled";
  }
}


export class Forbidden extends Error {
  constructor(readonly required: string) {
    super(`Your role does not include "${required}".`);
    this.name = "Forbidden";
  }
}


export async function requireSession(): Promise<Session> {
  const session = await resolveSession();
  if (!session) throw new Unauthenticated();
  if (session.suspended && !session.isOperator) {
    throw new OrganizationSuspended(session.suspended.reason);
  }
  if (!session.organizationId) throw new NotProvisioned();
  return session;
}


export async function requirePermission(permission: string): Promise<Session> {
  const session = await requireSession();
  if (!session.permissions.has(permission)) throw new Forbidden(permission);
  return session;
}


export async function requireModule(
  organizationId: string,
  module: string,
): Promise<void> {
  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { organization_id: organizationId },
    orderBy: { created_at: "desc" },
    select: { dunda_plans: { select: { modules: true, name: true } } },
  });
  
  
  const raw = subscription?.dunda_plans?.modules;
  const modules = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === "string")
    : null;
  if (modules !== null && !modules.includes(module)) {
    throw new ModuleNotInPlan(module, subscription?.dunda_plans?.name ?? null);
  }
  if (!(await isModuleEnabled(organizationId, module))) {
    throw new ModuleDisabled(module);
  }
}


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


export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    
    
    
    
    
    
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
  if (error instanceof ModuleNotInPlan) {
    return NextResponse.json(
      {
        error: error.message,
        code: "MODULE_NOT_IN_PLAN",
        module: error.module,
        planName: error.planName,
      },
      { status: 403 },
    );
  }
  if (error instanceof ModuleDisabled) {
    return NextResponse.json(
      {
        error: error.message,
        code: "MODULE_DISABLED",
        module: error.module,
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


export function orgWhere<T extends Record<string, unknown>>(
  organizationId: string,
  where?: T,
): T & { organization_id: string } {
  return { ...where, organization_id: organizationId } as T & {
    organization_id: string;
  };
}