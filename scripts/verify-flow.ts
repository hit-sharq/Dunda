/**
 * End-to-end check of the operational flow against the live database.
 *
 * Walks the path the product is built around — customer arrives, table opens,
 * drinks and food ordered, pool started and ended, one bill settled — using the
 * same services the API routes call. Then it asserts the money moved, the stock
 * moved, and that the rules refused the things they are meant to refuse.
 *
 * Run with: npm run verify:flow
 */
import { PrismaClient } from "@prisma/client";

/**
 * Idempotency keys are unique per run: the key identifies one request, and reusing
 * a key from an earlier run would be a genuine replay that the server correctly
 * short-circuits, which is not what this check is testing.
 */
const RUN = `flow-${Date.now()}`;
import { openTab, addTabItem, checkoutTab, closeTab, createOrder, updateOrderStatus } from "../lib/server/tabs";
import { startSession, endSession, pauseSession, resumeSession } from "../lib/server/pool";
import { reverseForVoid } from "../lib/server/inventory";
import { TRANSACTION_OPTIONS } from "../lib/db/transaction";

const prisma = new PrismaClient();
const ORG = "org_singapore_club";
const BR = "br_singapore_main";

let failures = 0;

function check(label: string, passed: boolean, detail?: unknown) {
  const mark = passed ? "pass" : "FAIL";
  if (!passed) failures++;
  console.log(`  [${mark}] ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
}

async function main() {
  console.log("Flow check against the live database\n");

  const [staff, products, table, customer] = await Promise.all([
    prisma.dunda_staff.findFirst({ where: { organization_id: ORG, status: "ACTIVE" } }),
    prisma.dunda_products.findMany({ where: { organization_id: ORG, active: true } }),
    prisma.dunda_tables.findFirst({
      where: { organization_id: ORG, status: "AVAILABLE" },
      orderBy: { name: "asc" },
    }),
    prisma.dunda_customers.findFirst({ where: { organization_id: ORG } }),
  ]);

  if (!staff || !table || !customer) throw new Error("Seed data is missing. Run npm run db:seed.");

  const beer = products.find((p) => p.name === "Tusker Lager")!;
  const food = products.find((p) => p.name === "Chips")!;
  const cocktail = products.find((p) => p.name === "Old Fashioned")!;

  // ---------------------------------------------------------------- the flow
  console.log("Customer arrives, table opens, drinks and food ordered");

  const tab = await openTab({
    organizationId: ORG,
    branchId: BR,
    customer: customer.name,
    table: table.name,
    tableId: table.id,
    customerId: customer.id,
    staffId: staff.id,
  });
  check("tab opened", tab.status === "OPEN", { number: tab.number });

  const tableAfterOpen = await prisma.dunda_tables.findUniqueOrThrow({ where: { id: table.id } });
  check("table marked occupied", tableAfterOpen.status === "OCCUPIED");

  await addTabItem({
    organizationId: ORG, tabId: tab.id, productId: beer.id, quantity: 4,
    unitId: null, notes: null, staffId: staff.id,
  });
  await addTabItem({
    organizationId: ORG, tabId: tab.id, productId: food.id, quantity: 1,
    unitId: null, notes: null, staffId: staff.id,
  });
  await addTabItem({
    organizationId: ORG, tabId: tab.id, productId: cocktail.id, quantity: 2,
    unitId: null, notes: "one without ice", staffId: staff.id,
  });

  let current = await prisma.dunda_tabs.findUniqueOrThrow({ where: { id: tab.id } });
  const expectedSubtotal = beer.price * 4 + food.price + cocktail.price * 2;
  check("tab subtotal is the sum of its lines", current.subtotal === expectedSubtotal, {
    stored: current.subtotal,
    expected: expectedSubtotal,
  });
  check("bar and food totals kept separately", current.bar_total === beer.price * 4 + cocktail.price * 2, {
    bar: current.bar_total,
    food: current.food_total,
  });
  check(
    "components add up to the total",
    current.subtotal - current.discount + current.service_charge + current.tax === current.total,
  );

  // -------------------------------------------------------------- pool joins
  console.log("\nPool session starts, pauses, resumes, and joins the same bill");

  // A table is chosen by what the database says about it, not by the status
  // column alone: a session left running makes a table unavailable whatever the
  // column says.
  const busy = await prisma.dunda_pool_sessions.findFirst({
    where: { organization_id: ORG, status: { in: ["ACTIVE", "PAUSED"] } },
    include: { dunda_pool_tables: { select: { name: true } } },
  });
  if (busy) {
    const refused = await startSession({
      organizationId: ORG, branchId: BR, poolTableId: busy.pool_table_id,
      tabId: null, customerId: null, staffId: staff.id,
    }).then(() => "accepted").catch((error: Error) => error.message);
    check(
      `a table already in use (${busy.dunda_pool_tables.name}) refuses a second game`,
      refused !== "accepted",
      { message: refused === "accepted" ? undefined : refused.slice(0, 70) },
    );
  }

  const poolTable = await prisma.dunda_pool_tables.findFirst({
    where: {
      organization_id: ORG,
      status: "AVAILABLE",
      dunda_pool_sessions: { none: { status: { in: ["ACTIVE", "PAUSED"] } } },
    },
    orderBy: { name: "asc" },
  });
  if (!poolTable) throw new Error("No free pool table.");

  const session = await startSession({
    organizationId: ORG,
    branchId: BR,
    poolTableId: poolTable.id,
    tabId: tab.id,
    customerId: customer.id,
    staffId: staff.id,
    // Two hours ago, so the bill has a duration worth checking.
    at: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });
  check("session started", session.status === "ACTIVE", { rate: session.hourly_rate });

  const rate = session.hourly_rate;
  await pauseSession(ORG, session.id, staff.id, new Date(Date.now() - 100 * 60 * 1000));
  await resumeSession(ORG, session.id, new Date(Date.now() - 60 * 60 * 1000));
  const resumed = await prisma.dunda_pool_sessions.findUniqueOrThrow({ where: { id: session.id } });
  check("pause time excluded from the bill", resumed.paused_seconds > 0, {
    pausedSeconds: resumed.paused_seconds,
  });

  await endSession(ORG, session.id, staff.id, new Date());
  current = await prisma.dunda_tabs.findUniqueOrThrow({ where: { id: tab.id } });

  const finished = await prisma.dunda_pool_sessions.findUniqueOrThrow({ where: { id: session.id } });
  const expectedPool = Math.round(((finished.billable_minutes * rate) / 60));
  check("pool charge computed from the rate rule", finished.charge === expectedPool, {
    billableMinutes: finished.billable_minutes,
    rate,
    charge: finished.charge,
  });
  check("pool charge landed on the same tab", current.pool_total === finished.charge, {
    poolTotal: current.pool_total,
  });
  check(
    "one combined bill covers bar, food and pool",
    current.subtotal === beer.price * 4 + food.price + cocktail.price * 2 + finished.charge,
    { subtotal: current.subtotal },
  );

  const poolTableAfter = await prisma.dunda_pool_tables.findUniqueOrThrow({
    where: { id: poolTable.id },
  });
  check("pool table freed when the game ended", poolTableAfter.status === "AVAILABLE");

  // ------------------------------------------------------------- one bill paid
  console.log("\nOne bill settled across two payment methods");

  const half = Math.floor(current.total / 2);
  const first = await checkoutTab({
    organizationId: ORG,
    tabId: tab.id,
    branchId: BR,
    payments: [{ method: "MPESA", amount: half, reference: "MPESA_TEST_1" }],
    staffId: staff.id,
    idempotencyKey: `${RUN}-part-one`,
  });
  check("partial payment leaves the rest outstanding", first.tab.outstanding > 0, {
    outstanding: first.tab.outstanding,
  });
  check("tab still open after a part payment", first.tab.status !== "CLOSED");

  const overpay = await checkoutTab({
    organizationId: ORG,
    tabId: tab.id,
    branchId: BR,
    payments: [{ method: "CASH", amount: current.total + 1000 }],
    staffId: staff.id,
  }).then(() => "accepted").catch((error: Error) => error.message);
  check("overpaying the tab is refused", overpay !== "accepted", { message: overpay });

  const second = await checkoutTab({
    organizationId: ORG,
    tabId: tab.id,
    branchId: BR,
    payments: [{ method: "CASH", amount: first.tab.outstanding }],
    staffId: staff.id,
    idempotencyKey: `${RUN}-part-two`,
  });
  check("bill settled in full", second.tab.outstanding === 0, { total: second.tab.total });
  check("tab closed once square", second.tabClosed === true);
  check("a receipt was issued", Boolean(second.receipt.number), second.receipt.number);

  // The same request sent twice, as a till that timed out and was pressed again
  // would do. The key has to bring back the same answer, not take money again.
  const replay = await checkoutTab({
    organizationId: ORG,
    tabId: tab.id,
    branchId: BR,
    payments: [{ method: "CASH", amount: first.tab.outstanding }],
    staffId: staff.id,
    idempotencyKey: `${RUN}-part-two`,
  });
  check("replaying a payment does not take money twice", replay.tab.outstanding === 0, {
    outstanding: replay.tab.outstanding,
  });

  const tableAfterPay = await prisma.dunda_tables.findUniqueOrThrow({ where: { id: table.id } });
  check("table returned to the floor when paid", tableAfterPay.status === "AVAILABLE");

  const paidTotal = await prisma.dunda_payments.aggregate({
    where: { tab_id: tab.id, status: { not: "VOIDED" } },
    _sum: { amount: true },
  });
  check(
    "payments on the tab sum to exactly the bill",
    (paidTotal._sum.amount ?? 0) === current.total,
    { paid: paidTotal._sum.amount, bill: current.total },
  );

  // ------------------------------------------------- inventory follows the sale
  console.log("\nCompleting an order draws stock; voiding gives it back");

  const stockBefore = Number(beer.stock);
  const order = await createOrder({
    organizationId: ORG,
    branchId: BR,
    tableId: table.id,
    tabId: null,
    customerId: customer.id,
    staffId: staff.id,
    items: [{ productId: beer.id, quantity: 2, unitId: null, notes: null }],
    notes: null,
    station: "BAR",
  });
  check("order created and routed to the bar", order.order.status === "PENDING");

  const untouched = await prisma.dunda_products.findUniqueOrThrow({ where: { id: beer.id } });
  check("entering an order does not move stock", Number(untouched.stock) === stockBefore, {
    before: stockBefore,
    now: Number(untouched.stock),
  });

  // The order walks the same lifecycle the bar and kitchen do: accepted,
  // prepared, plated, served. Completing it is what draws the stock.
  for (const stage of ["ACCEPTED", "PREPARING", "READY", "SERVED"] as const) {
    await updateOrderStatus(ORG, order.order.id, stage, staff.id);
  }
  await updateOrderStatus(ORG, order.order.id, "COMPLETED", staff.id);
  const afterSale = await prisma.dunda_products.findUniqueOrThrow({ where: { id: beer.id } });
  check("completing the sale draws stock", Number(afterSale.stock) === stockBefore - 2, {
    before: stockBefore,
    now: Number(afterSale.stock),
  });

  const saleMovements = await prisma.dunda_stock_movements.count({
    where: { reference_id: order.order.id, type: "SALE" },
  });
  check("the sale left a stock movement behind", saleMovements === 1);

  // A second completion must be refused: the lifecycle does not allow it.
  const replaySale = await updateOrderStatus(ORG, order.order.id, "COMPLETED", staff.id)
    .then(() => "accepted")
    .catch((error: Error) => error.message);
  check("a completed order cannot be completed again", replaySale !== "accepted", {
    message: replaySale === "accepted" ? undefined : replaySale.slice(0, 90),
  });

  // A completed order is settled; reversing it is a manager void, exercised
  // through the inventory service directly rather than by pretending the order
  // lifecycle allows it.
  const voidOrder = await updateOrderStatus(ORG, order.order.id, "CANCELLED", staff.id)
    .then(() => "accepted")
    .catch((error: Error) => error.message);
  check(
    "a completed order cannot simply be cancelled through its status",
    voidOrder !== "accepted",
    { message: voidOrder === "accepted" ? undefined : voidOrder.slice(0, 90) },
  );

  await prisma.$transaction(async (tx) =>
    reverseForVoid(tx, {
      organizationId: ORG,
      branchId: BR,
      referenceId: order.order.id,
      lines: [{ productId: beer.id, quantity: 2, unitId: null }],
      staffId: staff.id,
      reason: "Flow check: reversing a completed sale",
    }),
  TRANSACTION_OPTIONS);
  const afterVoid = await prisma.dunda_products.findUniqueOrThrow({ where: { id: beer.id } });
  check("a voided sale puts the stock back", Number(afterVoid.stock) === stockBefore, {
    afterVoid: Number(afterVoid.stock),
    stockBefore,
  });

  const voidMovement = await prisma.dunda_stock_movements.count({
    where: { reference_id: order.order.id, type: "RETURN" },
  });
  check("the reversal left its own movement rather than editing a quantity", voidMovement === 1);

  // ------------------------------------------------------------- refusals hold
  console.log("\nRules refuse what they should");

  // A table created with no rate rules at all: the situation a club gets when it
  // has not finished pricing its floor. It must refuse rather than charge nothing.
  const unratedTable = await prisma.dunda_pool_tables.create({
    data: {
      organization_id: ORG,
      branch_id: BR,
      name: "Flow check unrated",
      status: "AVAILABLE",
      base_rate: 0,
      minimum_minutes: 60,
      rounding_minutes: 30,
    },
  });
  const unrated = await startSession({
    organizationId: ORG, branchId: BR, poolTableId: unratedTable.id, tabId: null,
    customerId: null, staffId: staff.id,
  }).then(() => "accepted").catch((error: Error) => error.message);
  check("a pool table with no rate refuses to start", unrated !== "accepted", { message: unrated.slice(0, 90) });
  const stillFree = await prisma.dunda_pool_tables.findUniqueOrThrow({
    where: { id: unratedTable.id },
  });
  check("the unpriced table was left free rather than half-started", stillFree.status === "AVAILABLE");
  await prisma.dunda_pool_tables.delete({ where: { id: unratedTable.id } });

  const otherOrg = await prisma.dunda_tabs.findFirst({
    where: { organization_id: { not: ORG }, id: tab.id },
  });
  check("no tab exists outside this club for this tab id", otherOrg === null);

  const foreignProduct = await addTabItem({
    organizationId: "org_someone_else", tabId: tab.id, productId: beer.id, quantity: 1,
    unitId: null, notes: null, staffId: null,
  }).then(() => "accepted").catch(() => "refused");
  check("another club cannot add to this club's tab", foreignProduct === "refused");

  // ------------------------------------------------------------------ the log
  console.log("\nEverything sensitive was written to the audit log");

  const audit = await prisma.dunda_audit_logs.findMany({
    where: { organization_id: ORG, entity: { in: ["tab", "payment", "pool_session", "order"] } },
    orderBy: { created_at: "desc" },
    take: 50,
  });
  const entities = new Set(audit.map((a) => a.entity));
  check("tab changes audited", entities.has("tab"), { entries: audit.length });
  check("pool sessions audited", entities.has("pool_session"));
  check("payments audited", entities.has("payment"));
  check("orders audited", entities.has("order"));

  const poolAudit = audit.find((a) => a.entity === "pool_session");
  check(
    "the audit kept what the value was before and after",
    Boolean(poolAudit?.new_value) && Boolean(poolAudit?.previous_value),
    { new: poolAudit?.new_value, previous: poolAudit?.previous_value },
  );

  // ------------------------------------------------------------------- tidy up
  // Children first, or the foreign keys refuse. The audit log is left alone: it
  // records what this run actually did, and deleting it would defeat the point.
  await prisma.$transaction([
    prisma.dunda_receipts.deleteMany({ where: { tab_id: tab.id } }),
    prisma.dunda_payments.deleteMany({ where: { tab_id: tab.id } }),
    prisma.dunda_pool_sessions.deleteMany({ where: { pool_table_id: poolTable.id } }),
    prisma.dunda_tab_items.deleteMany({ where: { tab_id: tab.id } }),
    prisma.dunda_tabs.delete({ where: { id: tab.id } }),
    prisma.dunda_order_ticket_items.deleteMany({
      where: { dunda_order_tickets: { order_id: order.order.id } },
    }),
    prisma.dunda_order_tickets.deleteMany({ where: { order_id: order.order.id } }),
    prisma.dunda_order_items.deleteMany({ where: { order_id: order.order.id } }),
    prisma.dunda_orders.deleteMany({ where: { id: order.order.id } }),
    prisma.dunda_stock_movements.deleteMany({ where: { reference_id: order.order.id } }),
    prisma.dunda_tables.update({
      where: { id: table.id },
      data: { status: "AVAILABLE", tab_id: null, customer: null, total: 0 },
    }),
  ]);
  await prisma.dunda_products.update({
    where: { id: beer.id },
    data: { stock: stockBefore },
  });

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error("\nFlow check crashed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
