/**
 * Payment-path check against the live database.
 *
 * The flow check settles a bill from the till. This one walks the
 * paths only a provider payment takes: an attempt recorded before
 * the provider is asked, a settlement that arrives the way a webhook
 * delivers it, the retry that must not take money twice, and the
 * guards that refuse to ask a provider that is not configured.
 *
 * Run with: npx tsx scripts/verify-payments.ts
 */
const RUN = `pay-${Date.now()}`;
import { PrismaClient } from "@prisma/client";
import { openTab, addTabItem, applyTabPayment } from "../lib/server/tabs";
import {
  initiateClubPayment,
  initiateBillingPayment,
  resolveCallbackReference,
  getOpenBillingPayment,
} from "../lib/server/payments";

const prisma = new PrismaClient();
const ORG = "org_singapore_club";
const BR = "br_singapore_main";

let failures = 0;

function check(label: string, passed: boolean, detail?: unknown) {
  const mark = passed ? "pass" : "FAIL";
  if (!passed) failures++;
  console.log(`  [${mark}] ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
}

/** The first table free right now, re-read every time: a table
 *  stays occupied until its tab is settled, so a table chosen
 *  once cannot be chosen again for the next tab. */
async function freeTable() {
  const table = await prisma.dunda_tables.findFirst({
    where: { organization_id: ORG, status: "AVAILABLE" },
    orderBy: { name: "asc" },
  });
  if (!table) throw new Error("No free table.");
  return table;
}

async function main() {
  console.log("Payment paths against the live database\n");

  const [staff, products, customer] = await Promise.all([
    prisma.dunda_staff.findFirst({ where: { organization_id: ORG, status: "ACTIVE" } }),
    prisma.dunda_products.findMany({ where: { organization_id: ORG, active: true } }),
    prisma.dunda_customers.findFirst({ where: { organization_id: ORG } }),
  ]);
  const table = await freeTable();
  if (!staff || !table || !customer) throw new Error("Seed data is missing. Run npm run db:seed.");

  const beer = products.find((p) => p.name === "Tusker Lager")!;

  console.log("A provider payment settles the way a webhook delivers it");

  const tab = await openTab({
    organizationId: ORG,
    branchId: BR,
    customer: customer.name,
    table: table.name,
    tableId: table.id,
    customerId: customer.id,
    staffId: staff.id,
  });
  await addTabItem({
    organizationId: ORG, tabId: tab.id, productId: beer.id, quantity: 2,
    unitId: null, notes: null, staffId: staff.id,
  });
  const bill = await prisma.dunda_tabs.findUniqueOrThrow({ where: { id: tab.id } });

  // The attempt row, exactly as initiateClubPayment writes it before
  // the provider is asked. The tracking id is the provider's handle.
  const trackingId = `${RUN}-tracking`;
  const attempt = await prisma.dunda_payment_attempts.create({
    data: {
      organization_id: ORG,
      branch_id: BR,
      tab_id: tab.id,
      amount: bill.total,
      currency: "KES",
      method: "MPESA",
      provider: "PESAPAL",
      status: "INITIATED",
      reference: trackingId,
    },
  });

  // The settlement: what confirmClubPayment writes once Pesapal's own
  // status endpoint has said the money arrived.
  const settlement = await applyTabPayment({
    organizationId: ORG,
    tabId: tab.id,
    branchId: BR,
    payments: [{
      method: "MPESA",
      amount: bill.total,
      provider: "PESAPAL",
      reference: "PESAPAL_CONFIRMATION_1",
    }],
    staffId: null,
    attemptId: attempt.id,
  });

  check("provider payment settles the tab", settlement.tab.outstanding === 0, {
    outstanding: settlement.tab.outstanding,
  });
  check("tab closed by the provider's answer", settlement.tabClosed === true);
  check("the payment carries the provider and its reference", settlement.payments[0]?.method === "MPESA" && settlement.payments[0]?.reference === "PESAPAL_CONFIRMATION_1");

  const settledAttempt = await prisma.dunda_payment_attempts.findUniqueOrThrow({
    where: { id: attempt.id },
  });
  check("attempt resolved and points at the payment", settledAttempt.status === "RESOLVED" && settledAttempt.payment_id === settlement.payments[0]?.id, {
    status: settledAttempt.status,
    paymentId: settledAttempt.payment_id,
  });

  const paymentRow = await prisma.dunda_payments.findUniqueOrThrow({
    where: { id: settlement.payments[0]!.id },
  });
  check("the payment row names the provider", paymentRow.provider === "PESAPAL", {
    provider: paymentRow.provider,
  });

  console.log("\nThe same callback delivered twice");

  const before = await prisma.dunda_payments.count({ where: { tab_id: tab.id } });
  const replay = await applyTabPayment({
    organizationId: ORG,
    tabId: tab.id,
    branchId: BR,
    payments: [{
      method: "MPESA",
      amount: bill.total,
      provider: "PESAPAL",
      reference: "PESAPAL_CONFIRMATION_1",
    }],
    staffId: null,
    attemptId: attempt.id,
  });
  const after = await prisma.dunda_payments.count({ where: { tab_id: tab.id } });
  check("a repeated callback takes no second payment", before === after && replay.tab.outstanding === 0, {
    paymentsBefore: before,
    paymentsAfter: after,
  });

  console.log("\nA callback is recognized by either reference it echoes");

  const byTracking = await resolveCallbackReference(trackingId, null);
  check("the provider's tracking id finds the attempt", byTracking?.kind === "CLUB_PAYMENT" && byTracking.attemptId === attempt.id);
  const byMerchant = await resolveCallbackReference(null, attempt.id);
  check("the merchant reference finds the attempt", byMerchant?.kind === "CLUB_PAYMENT" && byMerchant.attemptId === attempt.id);
  const unknown = await resolveCallbackReference("never-created", "also-never-created");
  check("an unknown reference resolves to nothing", unknown === null);

  console.log("\nGuards refuse what they should");

  // A tab that still owes something, so the guard under test is
  // the provider one rather than the amount checks in front of it.
  const table3 = await freeTable();
  const tab3 = await openTab({
    organizationId: ORG,
    branchId: BR,
    customer: customer.name,
    table: table3.name,
    tableId: table3.id,
    customerId: customer.id,
    staffId: staff.id,
  });
  await addTabItem({
    organizationId: ORG, tabId: tab3.id, productId: beer.id, quantity: 1,
    unitId: null, notes: null, staffId: staff.id,
  });

  // The guard is about a deployment with no credentials, so the
  // credentials are hidden for these checks and restored after,
  // which keeps the answer the same on every deployment.
  const savedKey = process.env.PESAPAL_CONSUMER_KEY;
  const savedSecret = process.env.PESAPAL_CONSUMER_SECRET;
  delete process.env.PESAPAL_CONSUMER_KEY;
  delete process.env.PESAPAL_CONSUMER_SECRET;

  const noProvider = await initiateClubPayment({
    organizationId: ORG,
    branchId: BR,
    tabId: tab3.id,
    amount: 100,
    method: "MPESA",
    staffId: staff.id,
  }).then(() => "accepted").catch((error: Error & { data?: { code?: string } }) => error.message);
  check("a club payment refuses to start without provider credentials", noProvider !== "accepted", { message: noProvider });

  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { organization_id: ORG },
    orderBy: { created_at: "desc" },
  });
  const noProviderBilling = await initiateBillingPayment({
    organizationId: ORG,
    subscriptionId: subscription?.id ?? "does-not-matter",
  }).then(() => "accepted").catch((error: Error) => error.message);
  check("a billing payment refuses the same way", noProviderBilling !== "accepted", { message: noProviderBilling });

  if (savedKey !== undefined) process.env.PESAPAL_CONSUMER_KEY = savedKey;
  if (savedSecret !== undefined) process.env.PESAPAL_CONSUMER_SECRET = savedSecret;

  const open = await getOpenBillingPayment(ORG);
  check("no billing payment is open for this club", open === null);

  console.log("\nThe till's own settlement still works after all of that");

  const table2 = await freeTable();
  const tab2 = await openTab({
    organizationId: ORG,
    branchId: BR,
    customer: customer.name,
    table: table2.name,
    tableId: table2.id,
    customerId: customer.id,
    staffId: staff.id,
  });
  await addTabItem({
    organizationId: ORG, tabId: tab2.id, productId: beer.id, quantity: 1,
    unitId: null, notes: null, staffId: staff.id,
  });
  const bill2 = await prisma.dunda_tabs.findUniqueOrThrow({ where: { id: tab2.id } });
  const cash = await applyTabPayment({
    organizationId: ORG,
    tabId: tab2.id,
    branchId: BR,
    payments: [{ method: "CASH", amount: bill2.total }],
    staffId: staff.id,
  });
  check("a cash settlement closes the tab", cash.tabClosed === true && cash.tab.outstanding === 0);

  // ------------------------------------------------------------------- tidy up
  // Children first, or the foreign keys refuse. The audit log is
  // left alone, the same way the flow check leaves it: it records
  // what this run actually did.
  await prisma.$transaction([
    prisma.dunda_receipts.deleteMany({ where: { tab_id: { in: [tab.id, tab2.id, tab3.id] } } }),
    prisma.dunda_payments.deleteMany({ where: { tab_id: { in: [tab.id, tab2.id, tab3.id] } } }),
    prisma.dunda_payment_provider_transactions.deleteMany({ where: { reference: attempt.id } }),
    prisma.dunda_payment_attempts.deleteMany({ where: { id: attempt.id } }),
    prisma.dunda_tab_items.deleteMany({ where: { tab_id: { in: [tab.id, tab2.id, tab3.id] } } }),
    prisma.dunda_tabs.deleteMany({ where: { id: { in: [tab.id, tab2.id, tab3.id] } } }),
    prisma.dunda_tables.updateMany({
      where: { tab_id: { in: [tab.id, tab2.id, tab3.id] } },
      data: { status: "AVAILABLE", tab_id: null, customer: null, total: 0 },
    }),
  ]);
  console.log("\nTest rows removed.");

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll payment checks passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
