import { db, plansTable } from "@workspace/db";

/**
 * The plan catalogue.
 *
 * Prices are whole shillings. The limits are the pricing: a club on a
 * one-branch plan that opens a second branch has to move up, and that is what
 * branchLimit and userLimit express. Modules gate the club app, so a tier can
 * carry pool or advanced reporting as a paid extra rather than everyone getting
 * everything.
 */

export const PLANS = [
  {
    id: "plan-starter",
    code: "STARTER",
    name: "Starter",
    description: "A single venue running the floor and the till.",
    monthlyPrice: 5000,
    // A year paid up front, at roughly two months free.
    annualPrice: 50000,
    branchLimit: 1,
    userLimit: 5,
    modules: ["pos", "inventory", "staff", "reports_basic"],
    isCustom: false,
    sortOrder: 1,
  },
  {
    id: "plan-professional",
    code: "PROFESSIONAL",
    name: "Professional",
    description: "Several staff, stock under control, bookings taken properly.",
    monthlyPrice: 10000,
    annualPrice: 100000,
    branchLimit: 2,
    userLimit: 20,
    modules: ["pos", "inventory", "staff", "reports_basic", "reports_advanced", "reservations", "events", "pool"],
    isCustom: false,
    sortOrder: 2,
  },
  {
    id: "plan-business",
    code: "BUSINESS",
    name: "Business",
    description: "Several branches with the group seen from above.",
    monthlyPrice: 20000,
    annualPrice: 200000,
    branchLimit: 10,
    userLimit: 100,
    modules: [
      "pos",
      "inventory",
      "staff",
      "reports_basic",
      "reports_advanced",
      "reservations",
      "events",
      "pool",
      "hq",
      "api",
    ],
    isCustom: false,
    sortOrder: 3,
  },
  {
    id: "plan-enterprise",
    code: "ENTERPRISE",
    name: "Enterprise",
    description: "Priced per agreement, for groups and chains.",
    monthlyPrice: 0,
    annualPrice: 0,
    branchLimit: 0, // 0 means agreed rather than capped.
    userLimit: 0,
    modules: ["pos", "inventory", "staff", "reports_basic", "reports_advanced", "reservations", "events", "pool", "hq", "api"],
    isCustom: true,
    sortOrder: 4,
  },
] as const;

async function seedPlans(): Promise<void> {
  for (const plan of PLANS) {
    await db
      .insert(plansTable)
      .values({ ...plan, modules: [...plan.modules] })
      .onConflictDoUpdate({
        target: plansTable.code,
        set: {
          name: plan.name,
          description: plan.description,
          monthlyPrice: plan.monthlyPrice,
          annualPrice: plan.annualPrice,
          branchLimit: plan.branchLimit,
          userLimit: plan.userLimit,
          modules: [...plan.modules],
          isCustom: plan.isCustom,
          sortOrder: plan.sortOrder,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`Plan catalogue reconciled: ${PLANS.length} tiers.`);
}

seedPlans()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Plan seeding failed:", err);
    process.exit(1);
  });