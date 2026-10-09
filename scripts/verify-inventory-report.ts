/**
 * Inventory report check against the live database.
 *
 * Runs the same function the route serves, so the
 * figures the screen shows are the ones checked here.
 *
 * Run with: npm run verify:inventory
 */
const RUN = `inv-${Date.now()}`;
import { PrismaClient } from "@prisma/client";
import { getInventoryReport } from "../lib/server/reports";

const prisma = new PrismaClient();
const ORG = "org_singapore_club";

let failures = 0;

function check(label: string, passed: boolean, detail?: unknown) {
  const mark = passed ? "pass" : "FAIL";
  if (!passed) failures++;
  console.log(`  [${mark}] ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
}

async function main() {
  console.log("Inventory report against the live database\n");

  const report = await getInventoryReport(ORG);
  check("the report answers with the position", typeof report.totalItems === "number" && typeof report.stockValue === "number", {
    totalItems: report.totalItems,
    stockValue: report.stockValue,
  });
  check("the reorder and out-of-stock counts are numbers", typeof report.belowReorder === "number" && typeof report.outOfStock === "number", {
    belowReorder: report.belowReorder,
    outOfStock: report.outOfStock,
  });
  check(
    "movements are grouped by type",
    report.byMovement.every((point) => typeof point.label === "string" && typeof point.value === "number"),
    report.byMovement,
  );
  check("discrepancies is a list", Array.isArray(report.discrepancies));

  // The discrepancy path is only exercised by an approved
  // count that found a variance, so one is created here
  // and removed again: the report has to surface it.
  const [branch, product] = await Promise.all([
    prisma.dunda_branches.findFirst({
      where: { organization_id: ORG },
      select: { id: true },
    }),
    prisma.dunda_products.findFirst({
      where: { organization_id: ORG, active: true, track_inventory: true },
      select: { id: true, stock: true },
    }),
  ]);
  if (!branch || !product) throw new Error("Seed data is missing. Run npm run db:seed.");

  const count = await prisma.dunda_stock_counts.create({
    data: {
      organization_id: ORG,
      branch_id: branch.id,
      status: "APPROVED",
      notes: RUN,
    },
  });
  await prisma.dunda_stock_count_items.create({
    data: {
      stock_count_id: count.id,
      product_id: product.id,
      expected_quantity: Number(product.stock),
      actual_quantity: Number(product.stock) + 3,
      variance: 3,
    },
  });

  const withCount = await getInventoryReport(ORG);
  const found = withCount.discrepancies.find((d) => d.productId === product.id);
  check("an approved count's variance is surfaced", Boolean(found) && found?.variance === 3, found);

  await prisma.dunda_stock_count_items.deleteMany({ where: { stock_count_id: count.id } });
  await prisma.dunda_stock_counts.delete({ where: { id: count.id } });

  const after = await getInventoryReport(ORG);
  check("the test count leaves no discrepancy behind", !after.discrepancies.some((d) => d.productId === product.id));

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll inventory report checks passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
