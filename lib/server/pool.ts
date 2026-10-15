import { TRANSACTION_OPTIONS } from "@/lib/db/transaction";
import { prisma } from "@/lib/db/client";


type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
import { conflict, wrongState } from "@/lib/errors.server";



export interface RateRule {
  id: string;
  
  poolTableId?: string | null;
  name: string;
  
  weekday: number | null;
  
  startMinute: number;
  
  endMinute: number;
  
  hourlyRate: number;
  minimumMinutes: number;
  roundingMinutes: number;
  
  roundingMode: string;
}


export function resolveRateRule(
  rules: RateRule[],
  weekday: number,
  minutesFromMidnight: number,
): RateRule | null {
  const matches = (rule: RateRule) => {
    if (rule.weekday !== null && rule.weekday !== weekday) return false;
    
    
    if (rule.startMinute === rule.endMinute) return false;
    if (rule.startMinute < rule.endMinute) {
      return minutesFromMidnight >= rule.startMinute && minutesFromMidnight < rule.endMinute;
    }
    return minutesFromMidnight >= rule.startMinute || minutesFromMidnight < rule.endMinute;
  };

  const applicable = rules.filter(matches);
  if (applicable.length === 0) return null;

  
  
  applicable.sort((a, b) => {
    if (a.poolTableId !== b.poolTableId) return a.poolTableId ? -1 : 1;
    const aWidth = a.endMinute - a.startMinute;
    const bWidth = b.endMinute - b.startMinute;
    return aWidth - bWidth;
  });

  return applicable[0];
}

type RateRuleWithTable = RateRule & { poolTableId: string | null };

export async function loadRateRules(
  organizationId: string,
  branchId: string,
  poolTableId: string,
): Promise<RateRuleWithTable[]> {
  const rows = await prisma.dunda_pool_rate_rules.findMany({
    where: {
      organization_id: organizationId,
      branch_id: branchId,
      active: true,
      OR: [{ pool_table_id: null }, { pool_table_id: poolTableId }],
    },
    orderBy: { id: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    poolTableId: r.pool_table_id,
    name: r.name,
    weekday: r.weekday,
    startMinute: r.start_minute,
    endMinute: r.end_minute,
    hourlyRate: r.hourly_rate,
    minimumMinutes: r.minimum_minutes,
    roundingMinutes: r.rounding_minutes,
    roundingMode: r.rounding_mode,
  }));
}


export async function currentRate(
  organizationId: string,
  branchId: string,
  poolTableId: string,
  at: Date = new Date(),
) {
  const rules = await loadRateRules(organizationId, branchId, poolTableId);
  const minutes = at.getHours() * 60 + at.getMinutes();
  return { rule: resolveRateRule(rules, at.getDay(), minutes), rules };
}

export interface PoolCharge {
  
  actualSeconds: number;
  
  billableMinutes: number;
  hourlyRate: number;
  charge: number;
}


export function computeCharge(
  startedAt: Date,
  endedAt: Date,
  pausedSeconds: number,
  rule: Pick<RateRule, "hourlyRate" | "minimumMinutes" | "roundingMinutes" | "roundingMode">,
): PoolCharge {
  const wallSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000) - Math.max(0, pausedSeconds),
  );
  const actualMinutes = Math.floor(wallSeconds / 60);

  let billable = Math.max(actualMinutes, rule.minimumMinutes);

  const block = Math.max(0, rule.roundingMinutes);
  if (block > 0) {
    switch (rule.roundingMode) {
      case "FLOOR":
        billable = Math.floor(billable / block) * block;
        break;
      case "NEAREST":
        billable = Math.round(billable / block) * block;
        break;
      case "CEIL":
      default:
        billable = Math.ceil(billable / block) * block;
        break;
    }
    
    
    if (billable === 0) billable = block;
  }

  
  
  const charge = Math.round((billable * rule.hourlyRate) / 60);

  return {
    actualSeconds: wallSeconds,
    billableMinutes: billable,
    hourlyRate: rule.hourlyRate,
    charge,
  };
}


export function accruedCharge(
  startedAt: Date,
  pausedSeconds: number,
  rule: Pick<RateRule, "hourlyRate" | "minimumMinutes" | "roundingMinutes" | "roundingMode">,
  at: Date = new Date(),
): PoolCharge {
  return computeCharge(startedAt, at, pausedSeconds, rule);
}

export interface StartSessionInput {
  organizationId: string;
  branchId: string;
  poolTableId: string;
  tabId: string | null;
  customerId: string | null;
  staffId: string | null;
  at?: Date;
}

export async function startSession(input: StartSessionInput) {
  const at = input.at ?? new Date();

  const table = await prisma.dunda_pool_tables.findFirst({
    where: {
      id: input.poolTableId,
      organization_id: input.organizationId,
    },
  });
  if (!table) {
    throw wrongState("That pool table is not part of this club.");
  }

  
  
  const running = await prisma.dunda_pool_sessions.findFirst({
    where: {
      pool_table_id: table.id,
      status: { in: ["ACTIVE", "PAUSED"] },
    },
  });
  if (running) {
    throw conflict(`${table.name} is already in use.`);
  }

  if (table.status === "MAINTENANCE") {
    throw wrongState(`${table.name} is under maintenance and cannot be started.`);
  }

  const reserved = await prisma.dunda_reservations.findFirst({
    where: {
      pool_table_id: table.id,
      starts_at: { lte: at },
      ends_at: { gt: at },
      status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
    },
  });
  if (reserved) {
    throw conflict(`${table.name} is reserved at this time.`);
  }

  const { rule } = await currentRate(
    input.organizationId,
    input.branchId,
    table.id,
    at,
  );
  if (!rule) {
    throw wrongState(
      `${table.name} has no rate configured for this time. Set one up before starting a session.`,
    );
  }

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.dunda_pool_sessions.create({
      data: {
        organization_id: input.organizationId,
        branch_id: input.branchId,
        pool_table_id: table.id,
        tab_id: input.tabId,
        customer_id: input.customerId,
        started_by_id: input.staffId,
        status: "ACTIVE",
        started_at: at,
        hourly_rate: rule.hourlyRate,
        rate_rule_id: rule.id,
      },
    });

    await tx.dunda_pool_tables.update({
      where: { id: table.id },
      data: { status: "OCCUPIED" },
    });

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: input.organizationId,
        branch_id: input.branchId,
        staff_id: input.staffId,
        action: "CREATE",
        entity: "pool_session",
        entity_id: created.id,
        detail: `${table.name} started at ${rule.hourlyRate}/hour`,
      },
    });

    return created;
  }, TRANSACTION_OPTIONS);

  return session;
}

export async function pauseSession(
  organizationId: string,
  sessionId: string,
  staffId: string | null,
  at: Date = new Date(),
) {
  const session = await prisma.dunda_pool_sessions.findFirst({
    where: { id: sessionId, organization_id: organizationId },
  });
  if (!session) throw wrongState("That pool session no longer exists.");
  if (session.status !== "ACTIVE") {
    throw wrongState("Only a running session can be paused.");
  }

  return prisma.dunda_pool_sessions.update({
    where: { id: sessionId },
    data: { status: "PAUSED", paused_at: at },
  });
}

export async function resumeSession(
  organizationId: string,
  sessionId: string,
  at: Date = new Date(),
) {
  const session = await prisma.dunda_pool_sessions.findFirst({
    where: { id: sessionId, organization_id: organizationId },
  });
  if (!session) throw wrongState("That pool session no longer exists.");
  if (session.status !== "PAUSED") {
    throw wrongState("Only a paused session can be resumed.");
  }

  
  
  
  const pausedFor =
    session.paused_at ? Math.floor((at.getTime() - session.paused_at.getTime()) / 1000) : 0;

  return prisma.dunda_pool_sessions.update({
    where: { id: sessionId },
    data: {
      status: "ACTIVE",
      resumed_at: at,
      paused_seconds: session.paused_seconds + Math.max(0, pausedFor),
    },
  });
}


export async function endSession(
  organizationId: string,
  sessionId: string,
  staffId: string | null,
  at: Date = new Date(),
) {
  const session = await prisma.dunda_pool_sessions.findFirst({
    where: { id: sessionId, organization_id: organizationId },
  });
  if (!session) throw wrongState("That pool session no longer exists.");
  if (session.status === "COMPLETED") {
    throw wrongState("That pool session has already been ended.");
  }
  if (session.status !== "ACTIVE" && session.status !== "PAUSED") {
    throw wrongState("That pool session cannot be ended.");
  }

  
  const pausedSeconds =
    session.status === "PAUSED" && session.paused_at
      ? session.paused_seconds + Math.floor((at.getTime() - session.paused_at.getTime()) / 1000)
      : session.paused_seconds;

  const charge = computeCharge(session.started_at, at, pausedSeconds, {
    hourlyRate: session.hourly_rate,
    minimumMinutes: 0,
    roundingMinutes: 1,
    roundingMode: "FLOOR",
  });

  return prisma.$transaction(async (tx) => {
    
    
    const locked = await tx.dunda_pool_sessions.findUnique({ where: { id: sessionId } });
    if (!locked || locked.status === "COMPLETED") {
      throw wrongState("That pool session has already been ended.");
    }

    const settled = await tx.dunda_pool_sessions.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        ended_at: at,
        ended_by_id: staffId,
        paused_seconds: pausedSeconds,
        actual_seconds: charge.actualSeconds,
        billable_minutes: charge.billableMinutes,
        charge: charge.charge,
        charged: true,
        charged_at: at,
      },
    });

    await tx.dunda_pool_tables.update({
      where: { id: session.pool_table_id },
      data: { status: "AVAILABLE" },
    });

    if (session.tab_id) {
      const tab = await tx.dunda_tabs.findFirst({
        where: { id: session.tab_id, organization_id: organizationId },
      });
      if (!tab) throw wrongState("The tab this session was attached to is gone.");

      
      
      const poolTotal = tab.pool_total + charge.charge;
      
      
      const recalculated = await recalculateTab(tx, {
        organizationId,
        tabId: tab.id,
        overridePoolTotal: poolTotal,
        discount: tab.discount,
      });

      
      
      await tx.dunda_tabs.update({
        where: { id: tab.id },
        data: { ...recalculated },
      });

      await tx.dunda_tab_items.create({
        data: {
          organization_id: organizationId,
          tab_id: tab.id,
          product_id: await poolTimeProductId(tx, organizationId),
          name: `Pool session (${formatMinutes(charge.billableMinutes)})`,
          quantity: 1,
          unit_price: charge.charge,
          total: charge.charge,
          category: POOL_CATEGORY,
          notes: `${charge.billableMinutes} billable minutes at ${charge.hourlyRate}/hour`,
        },
      });
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: session.branch_id,
        staff_id: staffId,
        action: "UPDATE",
        entity: "pool_session",
        entity_id: session.id,
        detail: `Ended after ${formatMinutes(charge.billableMinutes)}, charged ${charge.charge}`,
        previous_value: { status: session.status },
        new_value: { status: "COMPLETED", charge: charge.charge },
      },
    });

    return settled;
  }, TRANSACTION_OPTIONS);
}


async function poolTimeProductId(tx: Tx, organizationId: string): Promise<string> {
  const existing = await tx.dunda_products.findFirst({
    where: { organization_id: organizationId, category: POOL_CATEGORY },
    select: { id: true },
  });
  if (existing) return existing.id;

  let category = await tx.dunda_categories.findFirst({
    where: { organization_id: organizationId, name: POOL_CATEGORY },
    select: { id: true },
  });
  if (!category) {
    category = await tx.dunda_categories.create({
      data: {
        organization_id: organizationId,
        name: POOL_CATEGORY,
        color: "#4f8fa8",
        group: "POOL",
        station: "BAR",
        sort_order: 90,
      },
    });
  }

  
  
  const product = await tx.dunda_products.create({
    data: {
      organization_id: organizationId,
      category_id: category.id,
      name: POOL_CATEGORY,
      category: POOL_CATEGORY,
      unit: "session",
      base_unit: "session",
      price: 0,
      cost: 0,
      tax: 0,
      track_inventory: false,
      available: "true",
      accent: "sky",
    },
  });

  return product.id;
}

const POOL_CATEGORY = "Pool";

export { POOL_CATEGORY };

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}


export async function recalculateTab(
  tx: Tx,
  input: {
    organizationId: string;
    tabId: string;
    discount: number;
    overridePoolTotal?: number;
  },
) {
  const tab = await tx.dunda_tabs.findFirst({
    where: { id: input.tabId, organization_id: input.organizationId },
    include: { dunda_tab_items: { select: { total: true, category: true } } },
  });
  if (!tab) throw wrongState("That tab no longer exists.");

  const poolTotal = input.overridePoolTotal ?? tab.pool_total;

  
  
  
  
  const isPool = (category: string | null) =>
    (category ?? "").trim().toUpperCase() === "POOL";
  const isFood = (category: string | null) =>
    (category ?? "").trim().toUpperCase() === "FOOD";

  const lines = tab.dunda_tab_items
    .filter((item) => !isPool(item.category))
    .reduce(
      (acc, item) => {
        acc.subtotal += item.total;
        if (isFood(item.category)) acc.food += item.total;
        else acc.bar += item.total;
        return acc;
      },
      { subtotal: 0, bar: 0, food: 0 },
    );

  
  
  
  const subtotal = lines.subtotal + poolTotal;
  const settings = await loadRates(tx, input.organizationId);
  const net = Math.max(0, subtotal - input.discount);
  const serviceCharge = Math.round((net * settings.serviceChargeRate) / 100);
  const tax = Math.round((net * settings.taxRate) / 100);

  return {
    bar_total: lines.bar,
    food_total: lines.food,
    pool_total: poolTotal,
    subtotal,
    service_charge: serviceCharge,
    tax,
    total: net + serviceCharge + tax,
  };
}

async function loadRates(
  tx: Tx,
  organizationId: string,
) {
  const row = await tx.dunda_organization_settings.findUnique({
    where: { organization_id: organizationId },
    select: { tax_rate: true, service_charge_rate: true },
  });
  if (row) {
    return { taxRate: row.tax_rate, serviceChargeRate: row.service_charge_rate };
  }
  const org = await tx.dunda_organizations.findUnique({
    where: { id: organizationId },
    select: { tax_rate: true, service_charge_rate: true },
  });
  return {
    taxRate: org?.tax_rate ?? 0,
    serviceChargeRate: org?.service_charge_rate ?? 0,
  };
}