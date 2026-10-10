/**
 * Report check against the live database.
 *
 * Runs every report function the routes serve, so the
 * figures the Reports and HQ screens show are the ones
 * checked here.
 *
 * Run with: npm run verify:reports
 */
const RUN = `rep-${Date.now()}`;
import { PrismaClient } from "@prisma/client";
import {
  getSalesReport,
  getProductReport,
  getStaffReport,
  getTableReport,
  getPaymentReport,
  getEventReport,
} from "../lib/server/reports";

const prisma = new PrismaClient();
const ORG = "org_singapore_club";

let failures = 0;

function check(label: string, passed: boolean, detail?: unknown) {
  const mark = passed ? "pass" : "FAIL";
  if (!passed) failures++;
  console.log(`  [${mark}] ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
}

async function main() {
  console.log("Reports against the live database\n");

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  console.log("Sales over the last thirty days");
  const sales = await getSalesReport(ORG, null, thirtyDaysAgo, today);
  check("the window is echoed back", sales.dateFrom === thirtyDaysAgo && sales.dateTo === today);
  check(
    "revenue, orders and the average agree",
    typeof sales.totalRevenue === "number" &&
      typeof sales.totalOrders === "number" &&
      (sales.totalOrders === 0 || sales.averageOrderValue === Math.round(sales.totalRevenue / sales.totalOrders)),
    { revenue: sales.totalRevenue, orders: sales.totalOrders, average: sales.averageOrderValue },
  );
  check(
    "the payment mix and the hours are points",
    sales.byPaymentMethod.every((p) => typeof p.label === "string" && typeof p.value === "number") &&
      sales.byHour.every((p) => typeof p.label === "string" && typeof p.value === "number"),
    { methods: sales.byPaymentMethod, hours: sales.byHour.slice(0, 3) },
  );

  console.log("\nProducts over the last thirty days");
  const products = await getProductReport(ORG, null, thirtyDaysAgo, today);
  check(
    "every item names what sold and how much it earned",
    products.every((item) => typeof item.name === "string" && typeof item.category === "string" && typeof item.quantitySold === "number" && typeof item.revenue === "number"),
    products.slice(0, 3),
  );
  check("best earners come first", products.every((item, i) => i === 0 || products[i - 1].revenue >= item.revenue));

  console.log("\nStaff, tables, payments and events");
  const [staff, tables, payments, events] = await Promise.all([
    getStaffReport(ORG, null),
    getTableReport(ORG, null),
    getPaymentReport(ORG, null),
    getEventReport(ORG, null),
  ]);
  check(
    "staff rows carry the member, their orders and their revenue",
    staff.every((row) => typeof row.name === "string" && typeof row.orders === "number" && typeof row.revenue === "number"),
    staff.slice(0, 3),
  );
  check(
    "table rows carry the section, seats, trade and stay",
    tables.every((row) => typeof row.section === "string" && typeof row.seats === "number" && typeof row.revenue === "number" && typeof row.covers === "number" && typeof row.averageStayMinutes === "number"),
    tables.slice(0, 3),
  );
  check(
    "the payment report totals what came in and what went back",
    typeof payments.total === "number" && typeof payments.refunded === "number" && payments.byMethod.every((m) => typeof m.count === "number"),
    { total: payments.total, refunded: payments.refunded, methods: payments.byMethod },
  );
  check(
    "event rows carry the date, capacity, reservations and utilisation",
    events.every((row) => typeof row.date === "string" && typeof row.capacity === "number" && typeof row.reservations === "number" && typeof row.guests === "number" && typeof row.utilisation === "number"),
    events.slice(0, 3),
  );

  // The event path is only exercised by an event with
  // reservations, so one is created here and removed
  // again: the report has to count it.
  const [branch, customer] = await Promise.all([
    prisma.dunda_branches.findFirst({
      where: { organization_id: ORG },
      select: { id: true },
    }),
    prisma.dunda_customers.findFirst({
      where: { organization_id: ORG },
      select: { id: true },
    }),
  ]);
  if (!branch || !customer) throw new Error("Seed data is missing. Run npm run db:seed.");

  const event = await prisma.dunda_events.create({
    data: {
      organization_id: ORG,
      branch_id: branch.id,
      name: `Verify night ${RUN}`,
      date: today,
      start_time: "20:00",
      end_time: "23:00",
      capacity: 100,
      status: "UPCOMING",
    },
  });
  await prisma.dunda_event_reservations.createMany({
    data: [
      { event_id: event.id, customer_id: customer.id, guests: 4 },
      { event_id: event.id, customer_id: customer.id, guests: 2 },
    ],
  });

  const withEvent = await getEventReport(ORG, null);
  const found = withEvent.find((row) => row.id === event.id);
  check("an event's reservations and guests are counted", found?.reservations === 2 && found?.guests === 6 && found?.utilisation === 6, found);

  await prisma.dunda_event_reservations.deleteMany({ where: { event_id: event.id } });
  await prisma.dunda_events.delete({ where: { id: event.id } });

  const after = await getEventReport(ORG, null);
  check("the test event leaves nothing behind", !after.some((row) => row.id === event.id));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll report checks passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
