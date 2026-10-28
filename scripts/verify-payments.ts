
const RUN = `pay-${Date.now()}`;
import { PrismaClient } from "@prisma/client";
import { openTab, addTabItem, applyTabPayment } from "../lib/server/tabs";
import {
  initiateClubPayment,
  initiateBillingPayment,
  resolveCallbackReference,
  getOpenBillingPayment,
  refundClubPayment,
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

  console.log("\nRefunds go back through the provider and the books");

  const table4 = await freeTable();
  const tab4 = await openTab({
    organizationId: ORG, branchId: BR, customer: customer.name,
    table: table4.name, tableId: table4.id, customerId: customer.id, staffId: staff.id,
  });
  await addTabItem({ organizationId: ORG, tabId: tab4.id, productId: beer.id, quantity: 1, unitId: null, notes: null, staffId: staff.id });
  const bill4 = await prisma.dunda_tabs.findUniqueOrThrow({ where: { id: tab4.id } });
  const cash4 = await applyTabPayment({
    organizationId: ORG, tabId: tab4.id, branchId: BR,
    payments: [{ method: "CASH", amount: bill4.total }],
    staffId: staff.id,
  });
  check("cash settles tab4", cash4.tabClosed === true && cash4.tab.outstanding === 0);
  const cashPayment4 = cash4.payments[0]!;
  const refunded4 = await refundClubPayment({
    organizationId: ORG, paymentId: cashPayment4.id, amount: bill4.total,
    reason: "verify-payments refund", staffId: staff.id, staffName: staff.name,
  });
  check("cash refund approved in books", refunded4.status === "APPROVED" && refunded4.amount === bill4.total);
  const paid4 = await prisma.dunda_payments.findUniqueOrThrow({ where: { id: cashPayment4.id } });
  check("full refund voids cash payment", paid4.status === "REFUNDED");
  const tab4after = await prisma.dunda_tabs.findUniqueOrThrow({ where: { id: tab4.id } });
  check("refund puts money back on tab", tab4after.outstanding === bill4.total && tab4after.amount_paid === 0);

  const table5 = await freeTable();
  const tab5 = await openTab({
    organizationId: ORG, branchId: BR, customer: customer.name,
    table: table5.name, tableId: table5.id, customerId: customer.id, staffId: staff.id,
  });
  await addTabItem({ organizationId: ORG, tabId: tab5.id, productId: beer.id, quantity: 2, unitId: null, notes: null, staffId: staff.id });
  const bill5 = await prisma.dunda_tabs.findUniqueOrThrow({ where: { id: tab5.id } });
  const trackingId5 = `${RUN}-refund-tracking`;
  const attempt5 = await prisma.dunda_payment_attempts.create({
    data: { organization_id: ORG, branch_id: BR, tab_id: tab5.id, amount: bill5.total, currency: "KES", method: "MPESA", provider: "PESAPAL", status: "INITIATED", reference: trackingId5 },
  });
  const settled5 = await applyTabPayment({
    organizationId: ORG, tabId: tab5.id, branchId: BR,
    payments: [{ method: "MPESA", amount: bill5.total, provider: "PESAPAL", reference: "PESAPAL_REFUND_CONFIRMATION_5" }],
    staffId: null, attemptId: attempt5.id,
  });
  const providerPayment5 = settled5.payments[0]!;

  const partial5 = await refundClubPayment({
    organizationId: ORG, paymentId: providerPayment5.id, amount: 1,
    reason: "partial", staffId: staff.id, staffName: staff.name,
  }).then(() => "accepted").catch((error: Error) => error.message);
  check("mobile money refunded in full only", partial5 !== "accepted", { message: partial5 });

  const over5 = await refundClubPayment({
    organizationId: ORG, paymentId: providerPayment5.id, amount: bill5.total + 1,
    reason: "too much", staffId: staff.id, staffName: staff.name,
  }).then(() => "accepted").catch((error: Error) => error.message);
  check("refund cannot exceed payment", over5 !== "accepted", { message: over5 });

  const savedKey5 = process.env.PESAPAL_CONSUMER_KEY;
  const savedSecret5 = process.env.PESAPAL_CONSUMER_SECRET;
  delete process.env.PESAPAL_CONSUMER_KEY;
  delete process.env.PESAPAL_CONSUMER_SECRET;
  const refused5 = await refundClubPayment({
    organizationId: ORG, paymentId: providerPayment5.id, amount: bill5.total,
    reason: "full refund", staffId: staff.id, staffName: staff.name,
  }).then(() => "accepted").catch((error: Error) => error.message);
  if (savedKey5 !== undefined) process.env.PESAPAL_CONSUMER_KEY = savedKey5;
  if (savedSecret5 !== undefined) process.env.PESAPAL_CONSUMER_SECRET = savedSecret5;
  check("provider refund refuses without credentials", refused5 !== "accepted", { message: refused5 });
  const untouched5 = await prisma.dunda_payments.findUniqueOrThrow({ where: { id: providerPayment5.id } });
  check("refused refund leaves books untouched", untouched5.status === "SUCCESSFUL");
  const untouchedTab5 = await prisma.dunda_tabs.findUniqueOrThrow({ where: { id: tab5.id } });
  check("tab still owes full amount", untouchedTab5.outstanding === bill5.total);

  await prisma.dunda_refunds.create({
    data: { organization_id: ORG, branch_id: BR, payment_id: providerPayment5.id, amount: 1, reason: "earlier refund", status: "APPROVED" },
  });
  const second5 = await refundClubPayment({
    organizationId: ORG, paymentId: providerPayment5.id, amount: 1,
    reason: "again", staffId: staff.id, staffName: staff.name,
  }).then(() => "accepted").catch((error: Error) => error.message);
  check("provider payment refunded once", second5 !== "accepted", { message: second5 });

  
  
  
  
  await prisma.$transaction([
    prisma.dunda_receipts.deleteMany({ where: { tab_id: { in: [tab.id, tab2.id, tab3.id, tab4.id, tab5.id] } } }),
    prisma.dunda_refunds.deleteMany({ where: { payment_id: { in: [cashPayment4.id, providerPayment5.id] } } }),
    prisma.dunda_payments.deleteMany({ where: { tab_id: { in: [tab.id, tab2.id, tab3.id, tab4.id, tab5.id] } } }),
    prisma.dunda_payment_provider_transactions.deleteMany({ where: { reference: { in: [attempt.id, attempt5.id] } } }),
    prisma.dunda_payment_attempts.deleteMany({ where: { id: { in: [attempt.id, attempt5.id] } } }),
    prisma.dunda_tab_items.deleteMany({ where: { tab_id: { in: [tab.id, tab2.id, tab3.id, tab4.id, tab5.id] } } }),
    prisma.dunda_tabs.deleteMany({ where: { id: { in: [tab.id, tab2.id, tab3.id, tab4.id, tab5.id] } } }),
    prisma.dunda_tables.updateMany({
      where: { tab_id: { in: [tab.id, tab2.id, tab3.id, tab4.id, tab5.id] } },
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