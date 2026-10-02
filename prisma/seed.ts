/**
 * Seeds a working club into the connected database.
 *
 * Everything here is written through Prisma into the real tables. There is no
 * in-memory fixture and no mock layer: after this runs, the screens read what this
 * wrote, and the money in it obeys the same rules the till does.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { calculateTotals } from "../lib/server/money";
import { computeCharge } from "../lib/server/pool";

const prisma = new PrismaClient();

const ORG_ID = "org_singapore_club";
const BRANCH_ID = "br_singapore_main";

/** Roles, and what each may do. Mirrors section 6 of the specification. */
const ROLES = [
  {
    key: "owner",
    name: "Owner",
    isOwner: true,
    description: "Full control of the club",
    permissions: "ALL",
  },
  {
    key: "general_manager",
    name: "General Manager",
    isOwner: false,
    description: "Runs the club day to day",
    permissions: [
      "view_pos", "create_order", "modify_order", "update_ticket", "apply_discount",
      "void_order", "refund_payment", "close_order", "manage_payments", "view_inventory",
      "adjust_inventory", "approve_transfer", "manage_products", "manage_prices",
      "manage_staff", "manage_roles", "clock_shift", "manage_events",
      "manage_reservations", "manage_vip", "manage_floor", "view_reports",
      "view_audit_logs", "manage_branches",
    ],
  },
  {
    key: "manager",
    name: "Manager",
    isOwner: false,
    description: "Floor and till oversight",
    permissions: [
      "view_pos", "create_order", "modify_order", "update_ticket", "apply_discount",
      "void_order", "refund_payment", "close_order", "manage_payments", "view_inventory",
      "adjust_inventory", "approve_transfer", "manage_products", "manage_reservations",
      "manage_floor", "view_reports", "clock_shift",
    ],
  },
  {
    key: "cashier",
    name: "Cashier",
    isOwner: false,
    description: "Takes payment",
    permissions: ["view_pos", "create_order", "close_order", "manage_payments", "clock_shift"],
  },
  {
    key: "bartender",
    name: "Bartender",
    isOwner: false,
    description: "Works the bar",
    permissions: ["view_pos", "create_order", "modify_order", "update_ticket", "view_inventory", "clock_shift"],
  },
  {
    key: "waiter",
    name: "Waiter",
    isOwner: false,
    description: "Takes orders on the floor",
    permissions: ["view_pos", "create_order", "modify_order", "update_ticket", "manage_floor", "clock_shift"],
  },
  {
    key: "pool_attendant",
    name: "Pool Attendant",
    isOwner: false,
    description: "Runs the pool tables",
    permissions: ["view_pos", "manage_floor", "manage_reservations", "clock_shift"],
  },
  {
    key: "inventory_manager",
    name: "Inventory Manager",
    isOwner: false,
    description: "Owns the stock room",
    permissions: [
      "view_inventory", "adjust_inventory", "approve_transfer", "manage_products",
      "manage_prices", "view_reports",
    ],
  },
] as const;

const PERMISSIONS = [
  ["view_pos", "Access the point of sale", "POS"],
  ["create_order", "Take orders", "POS"],
  ["modify_order", "Amend orders", "POS"],
  ["update_ticket", "Work the station tickets", "POS"],
  ["apply_discount", "Apply discounts", "POS"],
  ["void_order", "Void orders", "POS"],
  ["refund_payment", "Issue refunds", "Payments"],
  ["close_order", "Close orders", "POS"],
  ["manage_payments", "Take payment", "Payments"],
  ["view_inventory", "View stock", "Inventory"],
  ["adjust_inventory", "Adjust stock", "Inventory"],
  ["approve_transfer", "Approve transfers", "Inventory"],
  ["manage_products", "Manage the catalog", "Catalog"],
  ["manage_prices", "Change prices", "Catalog"],
  ["manage_staff", "Manage staff", "People"],
  ["manage_roles", "Manage roles", "People"],
  ["clock_shift", "Clock in and out", "People"],
  ["manage_events", "Manage events", "Events"],
  ["manage_reservations", "Manage reservations", "Reservations"],
  ["manage_vip", "Manage VIP guests", "Guests"],
  ["manage_floor", "Edit the floor", "Floor"],
  ["view_reports", "View reports", "Reports"],
  ["view_audit_logs", "View the audit log", "Compliance"],
  ["manage_branches", "Manage branches", "Settings"],
] as const;

const CATEGORIES = [
  { name: "Beer", color: "#f0a34b", group: "BAR", station: "BAR", sort: 1 },
  { name: "Spirits", color: "#c97b3c", group: "BAR", station: "BAR", sort: 2 },
  { name: "Wine", color: "#8f2f3f", group: "BAR", station: "BAR", sort: 3 },
  { name: "Cocktails", color: "#b4562f", group: "BAR", station: "BAR", sort: 4 },
  { name: "Soft Drinks", color: "#4f8fa8", group: "BAR", station: "BAR", sort: 5 },
  { name: "Water", color: "#6f8f96", group: "BAR", station: "BAR", sort: 6 },
  { name: "Food", color: "#7a9b4f", group: "KITCHEN", station: "KITCHEN", sort: 7 },
  { name: "Snacks", color: "#a8834b", group: "KITCHEN", station: "KITCHEN", sort: 8 },
  { name: "Combos", color: "#5f7f5f", group: "KITCHEN", station: "KITCHEN", sort: 9 },
  { name: "Other", color: "#7a8580", group: "OTHER", station: "BAR", sort: 10 },
] as const;

/**
 * The catalog. Prices are what the club actually charges in Nairobi, in shillings.
 * Units show the conversion the club uses: a crate of Tusker is 24 bottles, a
 * bottle pours 6 glasses. None of that is a constant in the code.
 */
const PRODUCTS = [
  { name: "Tusker Lager", category: "Beer", price: 150, cost: 95, unit: "bottle", stock: 96, min: 24, sku: "BEER-TUS-001", barcode: "6001015000018" },
  { name: "Tusker Malt", category: "Beer", price: 150, cost: 92, unit: "bottle", stock: 72, min: 24, sku: "BEER-TUS-002", barcode: "6001015000025" },
  { name: "Asahi", category: "Beer", price: 320, cost: 240, unit: "bottle", stock: 24, min: 8, sku: "BEER-ASA-001", barcode: "4901777300216" },
  { name: "Chang", category: "Beer", price: 300, cost: 220, unit: "bottle", stock: 18, min: 8, sku: "BEER-CHA-001", barcode: "8850999001019" },
  { name: "Guinness", category: "Beer", price: 450, cost: 340, unit: "bottle", stock: 14, min: 6, sku: "BEER-GUI-001", barcode: "5000213000735" },
  { name: "Johnnie Walker Black", category: "Spirits", price: 1200, cost: 850, unit: "bottle", stock: 12, min: 4, sku: "SPI-JWB-001", barcode: "5000299222017" },
  { name: "Johnnie Walker Red", category: "Spirits", price: 700, cost: 480, unit: "bottle", stock: 16, min: 6, sku: "SPI-JWR-001", barcode: "5000299221030" },
  { name: "Jameson", category: "Spirits", price: 900, cost: 640, unit: "bottle", stock: 10, min: 4, sku: "SPI-JAM-001", barcode: "5000299224017" },
  { name: "Smirnoff Vodka", category: "Spirits", price: 800, cost: 560, unit: "bottle", stock: 14, min: 6, sku: "SPI-SMI-001", barcode: "1562160122013" },
  { name: "Jack Daniel's", category: "Spirits", price: 1100, cost: 780, unit: "bottle", stock: 8, min: 3, sku: "SPI-JAC-001", barcode: "5000299223021" },
  { name: "Cape Dry White", category: "Wine", price: 850, cost: 600, unit: "bottle", stock: 20, min: 6, sku: "WINE-CDW-001", barcode: "6001380024501" },
  { name: "Cape Dry Red", category: "Wine", price: 850, cost: 600, unit: "bottle", stock: 18, min: 6, sku: "WINE-CDR-001", barcode: "6001380024518" },
  { name: "Nairobi Cask", category: "Wine", price: 600, cost: 420, unit: "bottle", stock: 4, min: 6, sku: "WINE-NAI-001", barcode: "6001234567890" },
  { name: "Old Fashioned", category: "Cocktails", price: 750, cost: 380, unit: "glass", stock: 0, min: 0, sku: "COC-OFD-001", recipe: true },
  { name: "Whiskey Sour", category: "Cocktails", price: 720, cost: 360, unit: "glass", stock: 0, min: 0, sku: "COC-WSR-001", recipe: true },
  { name: "Margarita", category: "Cocktails", price: 780, cost: 400, unit: "glass", stock: 0, min: 0, sku: "COC-MAR-001", recipe: true },
  { name: "Piña Colada", category: "Cocktails", price: 700, cost: 340, unit: "glass", stock: 0, min: 0, sku: "COC-PIN-001", recipe: true },
  { name: "Coca-Cola", category: "Soft Drinks", price: 120, cost: 65, unit: "can", stock: 144, min: 48, sku: "SOD-COC-001", barcode: "5449000000996" },
  { name: "Fanta", category: "Soft Drinks", price: 120, cost: 62, unit: "can", stock: 120, min: 36, sku: "SOD-FAN-001", barcode: "5449000000065" },
  { name: "Sprite", category: "Soft Drinks", price: 120, cost: 62, unit: "can", stock: 108, min: 36, sku: "SOD-SPR-001", barcode: "5449000000423" },
  { name: "Red Bull", category: "Soft Drinks", price: 350, cost: 260, unit: "can", stock: 48, min: 24, sku: "SOD-RBU-001", barcode: "9692500000010" },
  { name: "Dasani Water", category: "Water", price: 80, cost: 40, unit: "bottle", stock: 192, min: 48, sku: "WAT-DAS-001", barcode: "5449000000995" },
  { name: "Rwenzori Water", category: "Water", price: 60, cost: 28, unit: "bottle", stock: 240, min: 48, sku: "WAT-RWE-001", barcode: "6009614400148" },
  { name: "Crispy Chicken Wings", category: "Food", price: 650, cost: 380, unit: "portion", stock: 0, min: 0, sku: "FOO-WIN-001" },
  { name: "Beef Burger", category: "Food", price: 750, cost: 440, unit: "portion", stock: 0, min: 0, sku: "FOO-BUR-001" },
  { name: "Chips", category: "Food", price: 300, cost: 150, unit: "portion", stock: 0, min: 0, sku: "FOO-CHI-001" },
  { name: "Nyama Choma Plate", category: "Food", price: 1200, cost: 720, unit: "portion", stock: 0, min: 0, sku: "FOO-NYA-001" },
  { name: "Samosa", category: "Snacks", price: 120, cost: 45, unit: "piece", stock: 80, min: 20, sku: "SNA-SAM-001" },
  { name: "Salted Nuts", category: "Snacks", price: 100, cost: 40, unit: "piece", stock: 60, min: 15, sku: "SNA-NUT-001" },
  { name: "Pork Crackles", category: "Snacks", price: 250, cost: 120, unit: "portion", stock: 24, min: 8, sku: "SNA-CRA-001" },
  { name: "Beer & Wings Combo", category: "Combos", price: 1300, cost: 740, unit: "combo", stock: 0, min: 0, sku: "COM-BWC-001" },
] as const;

const TABLES = [
  { section: "Main Floor", names: ["Table 1", "Table 2", "Table 3", "Table 4", "Table 5", "Table 6"] },
  { section: "VIP", names: ["VIP 1", "VIP 2", "VIP 3"] },
  { section: "Lounge", names: ["Lounge 1", "Lounge 2", "Lounge 3", "Lounge 4"] },
  { section: "Outdoor", names: ["Patio 1", "Patio 2"] },
] as const;

const STAFF = [
  { name: "Wanjiku Kamau", role: "owner", email: "wanjiku@singaporeclub.co.ke", phone: "+254722100001" },
  { name: "Brian Otieno", role: "general_manager", email: "brian@singaporeclub.co.ke", phone: "+254722100002" },
  { name: "Mercy Achieng", role: "manager", email: "mercy@singaporeclub.co.ke", phone: "+254722100003" },
  { name: "Kevin Mwangi", role: "cashier", email: "kevin@singaporeclub.co.ke", phone: "+254722100004" },
  { name: "Peter Njoroge", role: "bartender", email: "peter@singaporeclub.co.ke", phone: "+254722100005" },
  { name: "Alice Chebet", role: "bartender", email: "alice@singaporeclub.co.ke", phone: "+254722100006" },
  { name: "David Kimani", role: "waiter", email: "david@singaporeclub.co.ke", phone: "+254722100007" },
  { name: "Grace Wambui", role: "waiter", email: "grace@singaporeclub.co.ke", phone: "+254722100008" },
  { name: "Samuel Kiptoo", role: "pool_attendant", email: "samuel@singaporeclub.co.ke", phone: "+254722100009" },
  { name: "Faith Nyambura", role: "inventory_manager", email: "faith@singaporeclub.co.ke", phone: "+254722100010" },
] as const;

const CUSTOMERS = [
  { name: "Brian Karanja", phone: "+254711000001", email: "brian.karanja@gmail.com", vip: "GOLD" },
  { name: "Sarah Njeri", phone: "+254711000002", email: "sarah.njeri@gmail.com", vip: "NONE" },
  { name: "Michael Oduya", phone: "+254711000003", email: "michael.oduya@gmail.com", vip: "SILVER" },
  { name: "Linda Waweru", phone: "+254711000004", email: null, vip: "NONE" },
  { name: "Joseph Mutua", phone: "+254711000005", email: "joseph.mutua@gmail.com", vip: "PLATINUM" },
  { name: "Caroline Wangui", phone: "+254711000006", email: null, vip: "NONE" },
  { name: "Dennis Kariuki", phone: "+254711000007", email: "dennis.kariuki@gmail.com", vip: "BRONZE" },
  { name: "Patience Njeri", phone: "+254711000008", email: null, vip: "NONE" },
  { name: "Victor Omondi", phone: "+254711000009", email: "victor.omondi@gmail.com", vip: "SILVER" },
  { name: "Esther Wafula", phone: "+254711000010", email: null, vip: "NONE" },
] as const;

const SUPPLIERS = [
  { name: "Kenya Breweries", contact: "Distributor Sales", phone: "+254709000001", email: "orders@kenyabreweries.co.ke" },
  { name: "Liquor Depot", contact: "Nairobi Branch", phone: "+254709000002", email: "sales@liquordepot.co.ke" },
  { name: "Fresh Produce Ltd", contact: "Supply Desk", phone: "+254709000003", email: "orders@freshproduce.co.ke" },
  { name: "Pool Gear Kenya", contact: "Billiards Dept", phone: "+254709000004", email: "info@poolgear.co.ke" },
] as const;

/**
 * Pool pricing. Nothing in the application assumes these numbers: the rate rules
 * live in the database and the billing engine reads whatever is here.
 */
const POOL_RATES = {
  weekday: 400,
  friday: 600,
  saturday: 600,
  happyHour: 300,
};

async function main() {
  console.log("Seeding Singapore Club into the live database…");

  // The seed is idempotent: a club already there is rebuilt rather than duplicated,
  // so re-running after a schema change does not produce two Singapores.
  // Deleted child-first: every table that points at another is emptied before the
  // one it points at, so no foreign key is left holding a row nobody can see.
  await prisma.$transaction([
    // Order tickets, items and anything hanging off an order or a tab.
    prisma.dunda_order_ticket_items.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_order_tickets.deleteMany({ where: { organization_id: ORG_ID } }),
    // Prisma types this relation as to-one, so the nested filter goes under `is`.
    prisma.dunda_order_item_units.deleteMany({ where: { dunda_order_items: { is: { dunda_orders: { organization_id: ORG_ID } } } } }),
    prisma.dunda_order_items.deleteMany({ where: { dunda_orders: { is: { organization_id: ORG_ID } } } }),
    prisma.dunda_tab_item_units.deleteMany({ where: { dunda_tab_items: { organization_id: ORG_ID } } }),
    prisma.dunda_tab_items.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_refunds.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_receipts.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_payments.deleteMany({ where: { organization_id: ORG_ID } }),

    // A pool session points at a tab, so it has to go before the tab.
    prisma.dunda_pool_sessions.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_tabs.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_orders.deleteMany({ where: { organization_id: ORG_ID } }),

    prisma.dunda_event_reservations.deleteMany({ where: { dunda_events: { organization_id: ORG_ID } } }),
    prisma.dunda_event_tickets.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_event_guest_list.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_events.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_reservations.deleteMany({ where: { organization_id: ORG_ID } }),

    prisma.dunda_audit_logs.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_notifications.deleteMany({ where: { organization_id: ORG_ID } }),

    prisma.dunda_stock_transfer_items.deleteMany({ where: { dunda_stock_transfers: { organization_id: ORG_ID } } }),
    prisma.dunda_stock_transfers.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_stock_count_items.deleteMany({ where: { dunda_stock_counts: { organization_id: ORG_ID } } }),
    prisma.dunda_stock_counts.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_stock_movements.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_inventory_alerts.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_inventory_items.deleteMany({ where: { organization_id: ORG_ID } }),

    prisma.dunda_staff_shifts.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_staff.deleteMany({ where: { organization_id: ORG_ID } }),

    prisma.dunda_pool_rate_rules.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_pool_tables.deleteMany({ where: { organization_id: ORG_ID } }),

    prisma.dunda_tables.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_floor_sections.deleteMany({ where: { dunda_floors: { branch_id: BRANCH_ID } } }),
    prisma.dunda_floors.deleteMany({ where: { branch_id: BRANCH_ID } }),

    prisma.dunda_recipe_ingredients.deleteMany({ where: { dunda_recipes: { organization_id: ORG_ID } } }),
    prisma.dunda_recipes.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_unit_conversions.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_product_barcodes.deleteMany({ where: { dunda_products: { organization_id: ORG_ID } } }),
    prisma.dunda_product_branch_availability.deleteMany({ where: { dunda_products: { organization_id: ORG_ID } } }),
    prisma.dunda_product_units.deleteMany({ where: { dunda_products: { organization_id: ORG_ID } } }),
    prisma.dunda_products.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_categories.deleteMany({ where: { organization_id: ORG_ID } }),

    prisma.dunda_customers.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_suppliers.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_billing_payments.deleteMany({ where: { organization_id: ORG_ID } }),
    // Plans are platform-wide rather than per-club, so the org-scoped deletes
    // above never touch them. Clearing them is what makes the seed re-runnable.
    prisma.dunda_plans.deleteMany({}),
    prisma.dunda_subscriptions.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_invoices.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_branches.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_organization_settings.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_organization_features.deleteMany({ where: { organization_id: ORG_ID } }),
    prisma.dunda_organizations.deleteMany({ where: { id: ORG_ID } }),
  ]);

  const organization = await prisma.dunda_organizations.create({
    data: {
      id: ORG_ID,
      name: "Singapore Club",
      slug: "singapore-club",
      domain: "singaporeclub.co.ke",
      currency: "KES",
      tax_rate: 16,
      service_charge_rate: 10,
      status: "ACTIVE",
      last_activity_at: new Date(),
    },
  });

  // Every rate the club uses is stored here, so changing VAT takes effect on the
  // next order rather than needing a deploy.
  await prisma.dunda_organization_settings.create({
    data: {
      organization_id: ORG_ID,
      currency: "KES",
      timezone: "Africa/Nairobi",
      tax_rate: 16,
      tax_inclusive: false,
      service_charge_rate: 10,
      service_charge_mode: "PERCENT",
      settings: {
        receipt_footer: "Thank you — Singapore Club. Please drink responsibly.",
        invoice_footer: "Singapore Club, Moi Avenue, Nairobi",
      },
    },
  });

  for (const module of [
    "pos", "floor", "pool", "orders", "inventory", "products", "customers",
    "reservations", "events", "staff", "payments", "expenses", "reports",
  ]) {
    await prisma.dunda_organization_features.create({
      data: { organization_id: ORG_ID, module, enabled: true },
    });
  }

  // The plan catalogue. These are the tiers Dunda sells, and they are rows rather
  // than constants so the platform owner can change what a plan costs and what it
  // allows without a deploy — nothing in the application reads a price directly.
  const PLANS = [
    { code: "STARTER", name: "Starter", monthly_price: 4500, branch_limit: 1, user_limit: 5, description: "One venue, running the floor and the rail.", modules: ["pos", "floor", "orders", "products", "customers", "staff", "payments", "reports"] },
    { code: "PROFESSIONAL", name: "Professional", monthly_price: 9500, branch_limit: 2, user_limit: 15, description: "Adds pool, inventory and reservations.", modules: ["pos", "floor", "pool", "orders", "inventory", "products", "customers", "reservations", "staff", "payments", "expenses", "reports"] },
    { code: "BUSINESS", name: "Business", monthly_price: 18000, branch_limit: 5, user_limit: 40, description: "Multi-branch with events and advanced reporting.", modules: ["pos", "floor", "pool", "orders", "inventory", "products", "customers", "reservations", "events", "staff", "payments", "expenses", "reports"] },
    { code: "ENTERPRISE", name: "Enterprise", monthly_price: 42000, branch_limit: 25, user_limit: 200, description: "Unlimited reach across a group.", modules: ["pos", "floor", "pool", "orders", "inventory", "products", "customers", "reservations", "events", "staff", "payments", "expenses", "reports"] },
  ];

  const planIds = new Map<string, string>();
  for (const [index, plan] of PLANS.entries()) {
    const created = await prisma.dunda_plans.create({
      data: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        monthly_price: plan.monthly_price,
        // Two months' notice on the annual rate, which is roughly what a club
        // gets for paying up front.
        annual_price: plan.monthly_price * 20,
        branch_limit: plan.branch_limit,
        user_limit: plan.user_limit,
        modules: plan.modules,
        is_active: true,
        sort_order: index,
      },
    });
    planIds.set(plan.code, created.id);
  }

  // Singapore Club runs on Business, so the console has a live subscription to
  // read rather than an empty state. The trial has ended and money has been
  // taken, which is what a paying club looks like.
  await prisma.dunda_subscriptions.create({
    data: {
      organization_id: ORG_ID,
      plan_id: planIds.get("BUSINESS") ?? null,
      plan: "BUSINESS",
      status: "ACTIVE",
      billing_cycle: "MONTHLY",
      amount: 18000,
      currency: "KES",
      branch_limit: 5,
      user_limit: 40,
      current_branches: 1,
      current_users: STAFF.length,
      started_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      renews_at: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
    },
  });

  // One settled subscription payment, so the billing screen shows a real
  // transaction with a provider reference rather than an empty table.
  const subscription = await prisma.dunda_subscriptions.findFirstOrThrow({
    where: { organization_id: ORG_ID },
  });
  await prisma.dunda_billing_payments.create({
    data: {
      organization_id: ORG_ID,
      subscription_id: subscription.id,
      kind: "SUBSCRIPTION_RENEWAL",
      provider: "PESAPAL",
      status: "COMPLETED",
      amount: 18000,
      currency: "KES",
      provider_reference: "PESAPAL-INV-0001",
      provider_transaction_id: "pes_2demo20261001",
      paid_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    },
  });

  const branch = await prisma.dunda_branches.create({
    data: {
      id: BRANCH_ID,
      organization_id: ORG_ID,
      name: "Main Branch",
      city: "Nairobi",
      address: "Moi Avenue, opposite Jamia Mall",
      // LIVE, not ACTIVE: the schema defaults a branch to LIVE and the shell
      // renders it in its live colour only for that value. Seeding ACTIVE left
      // the branch switcher showing a branch that looked switched off.
      status: "LIVE",
      timezone: "Africa/Nairobi",
      phone: "+254202000100",
      email: "info@singaporeclub.co.ke",
    },
  });

  console.log(`  organization ${organization.name}, branch ${branch.name}`);

  // Permissions and roles. The owner role holds every permission, granted by name
  // rather than by a wildcard, so the role screen can show what an owner can do.
  const permissionIds = new Map<string, string>();
  for (const [name, description, category] of PERMISSIONS) {
    const row = await prisma.dunda_permissions.upsert({
      where: { name },
      create: { name, description, category },
      update: { description, category },
    });
    permissionIds.set(name, row.id);
  }

  const roleIds = new Map<string, string>();
  for (const role of ROLES) {
    const row = await prisma.dunda_roles.upsert({
      where: { name: role.name },
      create: {
        name: role.name,
        is_owner: role.isOwner,
        description: role.description,
        sort_order: ROLES.indexOf(role),
      },
      update: { is_owner: role.isOwner, description: role.description },
    });
    roleIds.set(role.key, row.id);

    const names =
      role.permissions === "ALL" ? PERMISSIONS.map(([name]) => name) : role.permissions;

    await prisma.dunda_role_permissions.deleteMany({ where: { role_id: row.id } });
    for (const name of names) {
      const permissionId = permissionIds.get(name);
      if (!permissionId) continue;
      await prisma.dunda_role_permissions.create({
        data: { role_id: row.id, permission_id: permissionId },
      });
    }
  }
  console.log(`  ${ROLES.length} roles, ${PERMISSIONS.length} permissions`);

  // Catalog
  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const row = await prisma.dunda_categories.create({
      data: {
        organization_id: ORG_ID,
        name: category.name,
        color: category.color,
        group: category.group,
        station: category.station,
        sort_order: category.sort,
      },
    });
    categoryIds.set(category.name, row.id);
  }

  const productIds = new Map<string, string>();
  for (const product of PRODUCTS) {
    const categoryId = categoryIds.get(product.category);
    if (!categoryId) continue;

    const row = await prisma.dunda_products.create({
      data: {
        organization_id: ORG_ID,
        category_id: categoryId,
        name: product.name,
        category: product.category,
        unit: product.unit,
        base_unit: product.unit,
        sku: product.sku,
        barcode: "barcode" in product ? product.barcode : null,
        cost: product.cost,
        price: product.price,
        tax: 16,
        track_inventory: product.stock > 0,
        available: "true",
        stock: product.stock,
        accent: "amber",
        minimum_stock: product.min,
      },
    });
    productIds.set(product.name, row.id);
  }
  console.log(`  ${PRODUCTS.length} products across ${CATEGORIES.length} categories`);

  // Selling units. A bottle of Tusker sells as a bottle or a glass; the glass is
  // one sixth of the bottle, which is stored here rather than assumed in code.
  await addUnit(productIds.get("Tusker Lager"), ORG_ID, "bottle", "btl", 1, 150, true);
  await addUnit(productIds.get("Tusker Lager"), ORG_ID, "glass", "gls", 1 / 6, 50, false);
  await addUnit(productIds.get("Tusker Malt"), ORG_ID, "bottle", "btl", 1, 150, true);
  await addUnit(productIds.get("Tusker Malt"), ORG_ID, "glass", "gls", 1 / 6, 50, false);
  await addUnit(productIds.get("Asahi"), ORG_ID, "bottle", "btl", 1, 320, true);
  await addUnit(productIds.get("Asahi"), ORG_ID, "glass", "gls", 1 / 6, 110, false);
  await addUnit(productIds.get("Johnnie Walker Black"), ORG_ID, "bottle", "btl", 1, 1200, true);
  await addUnit(productIds.get("Johnnie Walker Black"), ORG_ID, "shot", "sht", 1 / 25, 90, false);
  await addUnit(productIds.get("Smirnoff Vodka"), ORG_ID, "bottle", "btl", 1, 800, true);
  await addUnit(productIds.get("Smirnoff Vodka"), ORG_ID, "shot", "sht", 1 / 25, 60, false);
  await addUnit(productIds.get("Coca-Cola"), ORG_ID, "can", "can", 1, 120, true);
  await addUnit(productIds.get("Coca-Cola"), ORG_ID, "crate", "crt", 24, 2600, false);
  await addUnit(productIds.get("Dasani Water"), ORG_ID, "bottle", "btl", 1, 80, true);
  await addUnit(productIds.get("Dasani Water"), ORG_ID, "pack", "pk", 6, 450, false);

  // Cocktails draw their ingredients rather than holding stock of their own. The
  // quantities are what the bartender actually pours.
  await addRecipe(productIds.get("Old Fashioned"), ORG_ID, [
    ["Johnnie Walker Black", 45, "shot"],
    ["Coca-Cola", 0, null],
  ]);
  await addRecipe(productIds.get("Whiskey Sour"), ORG_ID, [
    ["Johnnie Walker Black", 45, "shot"],
    ["Coca-Cola", 0, null],
  ]);
  await addRecipe(productIds.get("Margarita"), ORG_ID, [
    ["Smirnoff Vodka", 45, "shot"],
    ["Coca-Cola", 0, null],
  ]);
  await addRecipe(productIds.get("Piña Colada"), ORG_ID, [
    ["Smirnoff Vodka", 30, "shot"],
    ["Coca-Cola", 0, null],
  ]);

  // Floor
  const floors = [
    { name: "Ground Floor", sections: ["Main Floor", "VIP", "Lounge", "Outdoor"] },
  ];
  for (const floor of floors) {
    const floorRow = await prisma.dunda_floors.create({
      data: { branch_id: BRANCH_ID, name: floor.name, sort_order: 0 },
    });
    for (const [index, sectionName] of floor.sections.entries()) {
      const section = await prisma.dunda_floor_sections.create({
        data: {
          floor_id: floorRow.id,
          name: sectionName,
          color: ["#f0a34b", "#c97b3c", "#b4562f", "#4f8fa8"][index] ?? "#7a8580",
          sort_order: index,
        },
      });
      const tablesForSection = TABLES.find((t) => t.section === sectionName);
      if (!tablesForSection) continue;
      for (const [i, name] of tablesForSection.names.entries()) {
        await prisma.dunda_tables.create({
          data: {
            organization_id: ORG_ID,
            branch_id: BRANCH_ID,
            floor_id: floorRow.id,
            floor_section_id: section.id,
            name,
            section: sectionName,
            seats: sectionName === "VIP" ? 8 : 4,
            status: "AVAILABLE",
            x: 40 + (i % 4) * 150,
            y: 40 + Math.floor(i / 4) * 150,
            width: 120,
            height: 120,
          },
        });
      }
    }
  }

  // Pool tables, with the positions the floor designer draws them at.
  const poolTables = [];
  for (let i = 1; i <= 5; i++) {
    poolTables.push(
      await prisma.dunda_pool_tables.create({
        data: {
          organization_id: ORG_ID,
          branch_id: BRANCH_ID,
          name: `Pool ${i}`,
          status: "AVAILABLE",
          base_rate: POOL_RATES.weekday,
          minimum_minutes: 60,
          rounding_minutes: 30,
          x: 60 + (i - 1) * 200,
          y: 520,
          width: 160,
          height: 90,
        },
      }),
    );
  }

  // Rate rules. Friday and Saturday carry the weekend rate; a happy-hour rule sits
  // over the early evening on weekdays.
  for (const table of poolTables) {
    await prisma.dunda_pool_rate_rules.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        pool_table_id: table.id,
        name: "Weekday rate",
        weekday: null,
        start_minute: 0,
        end_minute: 17 * 60,
        hourly_rate: POOL_RATES.weekday,
        minimum_minutes: 60,
        rounding_minutes: 30,
        rounding_mode: "CEIL",
      },
    });
    await prisma.dunda_pool_rate_rules.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        pool_table_id: table.id,
        name: "Evening rate",
        weekday: null,
        start_minute: 17 * 60,
        end_minute: 24 * 60,
        hourly_rate: POOL_RATES.friday,
        minimum_minutes: 60,
        rounding_minutes: 30,
        rounding_mode: "CEIL",
      },
    });
    await prisma.dunda_pool_rate_rules.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        pool_table_id: table.id,
        name: "Weekend rate",
        weekday: 5,
        start_minute: 12 * 60,
        end_minute: 24 * 60,
        hourly_rate: POOL_RATES.saturday,
        minimum_minutes: 60,
        rounding_minutes: 30,
        rounding_mode: "CEIL",
      },
    });
    await prisma.dunda_pool_rate_rules.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        pool_table_id: table.id,
        name: "Saturday rate",
        weekday: 6,
        start_minute: 12 * 60,
        end_minute: 24 * 60,
        hourly_rate: POOL_RATES.saturday,
        minimum_minutes: 60,
        rounding_minutes: 30,
        rounding_mode: "CEIL",
      },
    });
    await prisma.dunda_pool_rate_rules.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        pool_table_id: table.id,
        name: "Happy hour",
        weekday: null,
        start_minute: 17 * 60,
        end_minute: 19 * 60,
        hourly_rate: POOL_RATES.happyHour,
        minimum_minutes: 30,
        rounding_minutes: 30,
        rounding_mode: "CEIL",
      },
    });
  }
  console.log(`  ${poolTables.length} pool tables with weekday, weekend and happy-hour rates`);

  // Staff
  const staffIds = new Map<string, string>();
  for (const member of STAFF) {
    const row = await prisma.dunda_staff.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        name: member.name,
        email: member.email,
        phone: member.phone,
        role_id: roleIds.get(member.role)!,
        status: "ACTIVE",
      },
    });
    staffIds.set(member.role, row.id);
  }

  // On shift right now, with a float. This is what the dashboard's "on shift"
  // figure and the shift variance report both read.
  const shiftStaff = ["general_manager", "manager", "cashier", "bartender", "waiter", "pool_attendant"];
  const shiftIds: string[] = [];
  for (const [index, roleKey] of shiftStaff.entries()) {
    const staffId = staffIds.get(roleKey);
    if (!staffId) continue;
    const shift = await prisma.dunda_staff_shifts.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        staff_id: staffId,
        status: "OPEN",
        clock_in_at: new Date(Date.now() - (6 - index) * 60 * 60 * 1000),
        opening_cash: [20000, 15000, 10000, 5000, 3000, 2000][index] ?? 0,
      },
    });
    shiftIds.push(shift.id);
  }
  console.log(`  ${STAFF.length} staff, ${shiftIds.length} on shift`);

  for (const customer of CUSTOMERS) {
    await prisma.dunda_customers.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        vip_level: customer.vip,
      },
    });
  }

  for (const supplier of SUPPLIERS) {
    await prisma.dunda_suppliers.create({
      data: {
        organization_id: ORG_ID,
        name: supplier.name,
        contact: supplier.contact,
        phone: supplier.phone,
        email: supplier.email,
      },
    });
  }
  console.log(`  ${CUSTOMERS.length} customers, ${SUPPLIERS.length} suppliers`);

  await seedTrading(branch, productIds, categoryIds, staffIds, shiftIds);
  await seedTablesAndPool(branch, productIds, staffIds);
  await seedReservations();

  console.log("\nSeed complete.");
  console.log("  Organization : Singapore Club (org_singapore_club)");
  console.log("  Branch       : Main Branch (br_singapore_main)");
  console.log("  Pool tables  : Pool 1 – Pool 5");
  console.log("\nSign in as a Clerk user whose id is in ADMIN_IDS to reach the platform console.");
  console.log("A club sign-in needs a row in dunda_staff matching its clerk_user_id.");
}

/**
 * A night of trading.
 *
 * Written through the same rules the application enforces: totals come from
 * calculateTotals, pool charges from computeCharge, and stock is moved with
 * real movement rows rather than by writing a quantity.
 */
async function seedTrading(
  branch: { id: string },
  productIds: Map<string, string>,
  categoryIds: Map<string, string>,
  staffIds: Map<string, string>,
  shiftIds: string[],
) {
  const settings = { taxRate: 16, serviceChargeRate: 10 };
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

  // Opening stock is recorded as received movements, so the stock on hand is
  // explainable rather than a starting number with no history behind it.
  const inventoryItems = await prisma.dunda_inventory_items.findMany({
    where: { organization_id: ORG_ID },
    select: { id: true, product_id: true, current_quantity: true, name: true },
  });

  const receiveProducts = ["Kenya Breweries", "Liquor Depot", "Fresh Produce Ltd", "Pool Gear Kenya"];
  for (let i = 0; i < inventoryItems.length; i++) {
    const item = inventoryItems[i];
    const quantity = Number(item.current_quantity);
    if (quantity <= 0) continue;
    await prisma.dunda_stock_movements.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        product_id: item.product_id ?? "",
        type: "PURCHASE",
        quantity,
        quantity_in_base_unit: quantity,
        reason: `Opening stock from ${receiveProducts[i % receiveProducts.length]}`,
        created_at: hoursAgo(26),
      },
    });
  }

  // Orders through the night, each priced from the catalog rather than typed in.
  const menu: { product: string; quantity: number }[] = [
    { product: "Tusker Lager", quantity: 4 },
    { product: "Old Fashioned", quantity: 2 },
    { product: "Crispy Chicken Wings", quantity: 1 },
    { product: "Rwenzori Water", quantity: 2 },
    { product: "Asahi", quantity: 3 },
    { product: "Nyama Choma Plate", quantity: 1 },
    { product: "Johnnie Walker Black", quantity: 1 },
    { product: "Chips", quantity: 2 },
    { product: "Whiskey Sour", quantity: 2 },
    { product: "Coca-Cola", quantity: 6 },
    { product: "Samosa", quantity: 3 },
    { product: "Margarita", quantity: 2 },
    { product: "Guinness", quantity: 2 },
    { product: "Piña Colada", quantity: 1 },
    { product: "Beef Burger", quantity: 1 },
    { product: "Red Bull", quantity: 4 },
  ];

  const staffList = [...staffIds.values()];
  let orderNumber = 1041;
  let receiptNumber = 2001;

  for (let hour = 8; hour >= 1; hour--) {
    const ordersThisHour = 2 + (hour % 3);
    for (let n = 0; n < ordersThisHour; n++) {
      const staffId = staffList[(hour + n) % staffList.length];
      const menuStart = (hour * 3 + n * 5) % menu.length;
      const lines = [menu[menuStart], menu[(menuStart + 4) % menu.length], menu[(menuStart + 8) % menu.length]];

      let subtotal = 0;
      const items: {
        order_id: string;
        product_id: string;
        name: string;
        quantity: number;
        unit_price: number;
        total: number;
        category_id: string | null;
      }[] = [];

      const orderId = `ord_${hour}_${n}`;
      for (const line of lines) {
        const productId = productIds.get(line.product);
        if (!productId) continue;
        const product = await prisma.dunda_products.findUniqueOrThrow({
          where: { id: productId },
          select: { name: true, price: true, category: true, category_id: true },
        });
        const total = product.price * line.quantity;
        subtotal += total;
        items.push({
          order_id: orderId,
          product_id: productId,
          name: product.name,
          quantity: line.quantity,
          unit_price: product.price,
          total,
          category_id: product.category_id,
        });
      }
      if (items.length === 0) continue;

      const totals = calculateTotals(subtotal, 0, settings);
      const number = String(orderNumber++);

      await prisma.dunda_orders.create({
        data: {
          id: orderId,
          organization_id: ORG_ID,
          branch_id: BRANCH_ID,
          number: `ORD-${number}`,
          staff_id: staffId,
          status: "COMPLETED",
          subtotal,
          service_charge: totals.serviceCharge,
          tax: totals.tax,
          discount: 0,
          total: totals.total,
          revenue_category: "BAR",
          created_at: hoursAgo(hour),
        },
      });

      for (const item of items) {
        await prisma.dunda_order_items.create({ data: item });

        // Stock leaves when the sale completes, recorded as a movement so the
        // quantity on hand can always be explained.
        const product = await prisma.dunda_products.findUniqueOrThrow({
          where: { id: item.product_id },
          select: {
            stock: true,
            name: true,
            dunda_recipe_as_product: {
              select: {
                id: true,
                dunda_recipe_ingredients: {
                  select: { product_id: true, quantity: true },
                },
              },
            },
          },
        });
        const recipe = product.dunda_recipe_as_product;
        if (recipe) {
          for (const ingredient of recipe.dunda_recipe_ingredients) {
            if (Number(ingredient.quantity) <= 0) continue;
            await prisma.dunda_stock_movements.create({
              data: {
                organization_id: ORG_ID,
                branch_id: BRANCH_ID,
                product_id: ingredient.product_id,
                type: "SALE",
                quantity: Number(ingredient.quantity) * item.quantity,
                quantity_in_base_unit: Number(ingredient.quantity) * item.quantity,
                reference_id: orderId,
                reason: `${item.name} × ${item.quantity}`,
                staff_id: staffId,
                created_at: hoursAgo(hour),
              },
            });
            await prisma.dunda_products.update({
              where: { id: ingredient.product_id },
              data: { stock: { decrement: Number(ingredient.quantity) * item.quantity } },
            });
          }
        } else {
          await prisma.dunda_stock_movements.create({
            data: {
              organization_id: ORG_ID,
              branch_id: BRANCH_ID,
              product_id: item.product_id,
              type: "SALE",
              quantity: item.quantity,
              quantity_in_base_unit: item.quantity,
              reference_id: orderId,
              reason: `${item.name} × ${item.quantity}`,
              staff_id: staffId,
              created_at: hoursAgo(hour),
            },
          });
          await prisma.dunda_products.update({
            where: { id: item.product_id },
            data: { stock: { decrement: item.quantity } },
          });
        }
      }

      // Payment. Part cash, part M-Pesa, the way a real table settles.
      const cashShare = n % 2 === 0 ? Math.round(totals.total / 2) : totals.total;
      const mpesaShare = totals.total - cashShare;

      if (cashShare > 0) {
        await prisma.dunda_payments.create({
          data: {
            organization_id: ORG_ID,
            branch_id: BRANCH_ID,
            order_id: orderId,
            amount: cashShare,
            method: "CASH",
            status: "SUCCESSFUL",
            cashier_id: staffId,
            reference: `CASH-${number}`,
            paid_at: hoursAgo(hour - 0.5),
          },
        });
      }
      if (mpesaShare > 0) {
        await prisma.dunda_payments.create({
          data: {
            organization_id: ORG_ID,
            branch_id: BRANCH_ID,
            order_id: orderId,
            amount: mpesaShare,
            method: "MPESA",
            status: "SUCCESSFUL",
            cashier_id: staffId,
            reference: `MPESA${hoursAgo(hour).getTime().toString().slice(-9)}`,
            paid_at: hoursAgo(hour - 0.5),
          },
        });
      }
      receiptNumber++;
    }
  }

  // A tab with a live pool session on it: the combined bill the product is built
  // around. Bar, food and pool on one tab, one total for the guest.
  const waiter = staffIds.get("waiter") ?? null;
  const bartender = staffIds.get("bartender") ?? null;
  const poolTable = await prisma.dunda_pool_tables.findFirstOrThrow({
    where: { organization_id: ORG_ID, name: "Pool 1" },
  });
  const customers = await prisma.dunda_customers.findMany({
    where: { organization_id: ORG_ID },
    orderBy: { name: "asc" },
    take: 5,
  });

  await buildTab({
    customer: customers[0],
    tableName: "Pool 1",
    staffId: waiter,
    lines: [
      { product: "Tusker Lager", quantity: 4 },
      { product: "Old Fashioned", quantity: 2 },
      { product: "Crispy Chicken Wings", quantity: 1 },
      { product: "Rwenzori Water", quantity: 2 },
    ],
    pool: { tableId: poolTable.id, startedHoursAgo: 1.5, rate: POOL_RATES.friday, minimumMinutes: 60 },
    discount: 0,
  });

  // A second tab mid-order, still owing money.
  await buildTab({
    customer: customers[1],
    tableName: "Table 3",
    staffId: waiter,
    lines: [
      { product: "Asahi", quantity: 3 },
      { product: "Whiskey Sour", quantity: 2 },
      { product: "Chips", quantity: 2 },
    ],
    pool: null,
    discount: 0,
    leaveOpen: true,
  });

  // A closed tab with a receipt, settled across two methods — the split bill.
  await buildTab({
    customer: customers[2],
    tableName: "VIP 1",
    staffId: bartender,
    lines: [
      { product: "Johnnie Walker Black", quantity: 1 },
      { product: "Nyama Choma Plate", quantity: 1 },
      { product: "Coca-Cola", quantity: 4 },
    ],
    pool: null,
    discount: 500,
    settle: [
      { method: "MPESA", amountShare: 0.4 },
      { method: "CARD", amountShare: 0.6 },
    ],
  });

  console.log(`  ${orderNumber - 1041} settled orders and 3 tabs`);
}

/** Builds a tab the way the till does: lines, then pool, then one combined total. */
async function buildTab(input: {
  customer: { id: string; name: string } | undefined;
  tableName: string;
  staffId: string | null;
  lines: { product: string; quantity: number }[];
  pool: { tableId: string; startedHoursAgo: number; rate: number; minimumMinutes: number } | null;
  discount: number;
  leaveOpen?: boolean;
  settle?: { method: string; amountShare: number }[];
}) {
  if (!input.customer) return;
  const settings = { taxRate: 16, serviceChargeRate: 10 };
  const tabId = `tab_${Math.random().toString(36).slice(2, 10)}`;

  let barTotal = 0;
  let foodTotal = 0;
  let poolTotal = 0;
  let subtotal = 0;

  // The tab row is written before its items, because the items carry a foreign key
  // to it. Its money columns are filled in once the lines are known.
  await prisma.dunda_tabs.create({
    data: {
      id: tabId,
      organization_id: ORG_ID,
      branch_id: BRANCH_ID,
      number: `TAB-${tabId.slice(-4).toUpperCase()}`,
      customer: input.customer.name,
      customer_id: input.customer.id,
      staff_id: input.staffId ?? undefined,
      table_name: input.tableName,
      status: input.leaveOpen ? "OPEN" : "CLOSED",
      opened_at: new Date(Date.now() - (input.pool?.startedHoursAgo ?? 1) * 60 * 60 * 1000),
      closed_at: input.settle ? new Date() : null,
    },
  });

  for (const line of input.lines) {
    const product = await prisma.dunda_products.findFirst({
      where: { organization_id: ORG_ID, name: line.product },
      select: { id: true, name: true, price: true, category: true },
    });
    if (!product) continue;
    const total = product.price * line.quantity;
    subtotal += total;
    if (product.category === "Food") foodTotal += total;
    else barTotal += total;

    await prisma.dunda_tab_items.create({
      data: {
        organization_id: ORG_ID,
        tab_id: tabId,
        product_id: product.id,
        name: product.name,
        quantity: line.quantity,
        unit_price: product.price,
        total,
        category: product.category,
      },
    });
  }

  let sessionId: string | null = null;
  if (input.pool) {
    // The charge is worked out by the billing engine, not by arithmetic here, so
    // the seeded bill is exactly what the application would have produced.
    const startedAt = new Date(Date.now() - input.pool.startedHoursAgo * 60 * 60 * 1000);
    const charge = computeCharge(startedAt, new Date(), 0, {
      hourlyRate: input.pool.rate,
      minimumMinutes: input.pool.minimumMinutes,
      roundingMinutes: 30,
      roundingMode: "CEIL",
    });
    poolTotal = charge.charge;
    subtotal += poolTotal;

    const session = await prisma.dunda_pool_sessions.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        pool_table_id: input.pool.tableId,
        tab_id: tabId,
        customer_id: input.customer.id,
        started_by_id: input.staffId ?? undefined,
        status: "ACTIVE",
        started_at: startedAt,
        hourly_rate: input.pool.rate,
      },
    });
    sessionId = session.id;
  }

  const totals = calculateTotals(subtotal, input.discount, settings);

  await prisma.dunda_tabs.update({
    where: { id: tabId },
    data: {
      bar_total: barTotal,
      food_total: foodTotal,
      pool_total: poolTotal,
      subtotal: totals.subtotal,
      discount: input.discount,
      service_charge: totals.serviceCharge,
      tax: totals.tax,
      total: totals.total,
      amount_paid: input.settle ? totals.total : 0,
      outstanding: input.leaveOpen ? totals.total : 0,
    },
  });

  if (sessionId) {
    await prisma.dunda_pool_tables.update({
      where: { id: input.pool!.tableId },
      data: { status: "OCCUPIED" },
    });
  }

  if (input.settle) {
    let allocated = 0;
    for (const [index, part] of input.settle.entries()) {
      const isLast = index === input.settle.length - 1;
      const amount = isLast ? totals.total - allocated : Math.round(totals.total * part.amountShare);
      allocated += amount;
      await prisma.dunda_payments.create({
        data: {
          organization_id: ORG_ID,
          branch_id: BRANCH_ID,
          tab_id: tabId,
          amount,
          method: part.method,
          status: "SUCCESSFUL",
          cashier_id: input.staffId,
          reference: `${part.method}-${tabId.slice(-5)}`,
          paid_by: input.customer.name,
        },
      });
    }

    await prisma.dunda_receipts.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        number: `RCT-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        tab_id: tabId,
        customer_name: input.customer.name,
        customer_id: input.customer.id,
        issued_by_id: input.staffId,
        items_subtotal: totals.subtotal - poolTotal,
        pool_charges: poolTotal,
        discount: input.discount,
        service_charge: totals.serviceCharge,
        tax: totals.tax,
        total: totals.total,
        amount_paid: totals.total,
        outstanding: 0,
        payment_method: input.settle.map((s) => s.method).join(" + "),
      },
    });

    const table = await prisma.dunda_tables.findFirst({
      where: { organization_id: ORG_ID, name: input.tableName },
    });
    if (table) {
      await prisma.dunda_tables.update({
        where: { id: table.id },
        data: { status: "AVAILABLE", tab_id: null, customer: null, total: 0 },
      });
    }
  }

  if (input.leaveOpen) {
    const table = await prisma.dunda_tables.findFirst({
      where: { organization_id: ORG_ID, name: input.tableName },
    });
    if (table) {
      await prisma.dunda_tables.update({
        where: { id: table.id },
        data: { status: "OCCUPIED", tab_id: tabId, customer: input.customer.name },
      });
    }
  }
}

/** Some tabs settled earlier in the evening, so the pool report has history. */
async function seedTablesAndPool(
  branch: { id: string },
  productIds: Map<string, string>,
  staffIds: Map<string, string>,
) {
  const attendant = staffIds.get("pool_attendant") ?? null;
  const waiter = staffIds.get("waiter") ?? null;
  const customers = await prisma.dunda_customers.findMany({
    where: { organization_id: ORG_ID },
    take: 4,
  });
  const poolTables = await prisma.dunda_pool_tables.findMany({
    where: { organization_id: ORG_ID },
    orderBy: { name: "asc" },
  });

  // Finished games from earlier tonight, each charged by the billing engine.
  const finished: { tableIndex: number; hoursAgo: number; rate: number }[] = [
    { tableIndex: 1, hoursAgo: 3, rate: POOL_RATES.happyHour },
    { tableIndex: 2, hoursAgo: 5, rate: POOL_RATES.weekday },
    { tableIndex: 3, hoursAgo: 6.5, rate: POOL_RATES.weekday },
  ];

  for (const game of finished) {
    const table = poolTables[game.tableIndex];
    if (!table) continue;
    const startedAt = new Date(Date.now() - game.hoursAgo * 60 * 60 * 1000);
    const endedAt = new Date(startedAt.getTime() + 90 * 60 * 1000);
    const charge = computeCharge(startedAt, endedAt, 0, {
      hourlyRate: game.rate,
      minimumMinutes: 60,
      roundingMinutes: 30,
      roundingMode: "CEIL",
    });

    await prisma.dunda_pool_sessions.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        pool_table_id: table.id,
        customer_id: customers[game.tableIndex % Math.max(1, customers.length)]?.id ?? null,
        started_by_id: attendant,
        ended_by_id: attendant,
        status: "COMPLETED",
        started_at: startedAt,
        ended_at: endedAt,
        actual_seconds: charge.actualSeconds,
        billable_minutes: charge.billableMinutes,
        hourly_rate: game.rate,
        charge: charge.charge,
        charged: true,
        charged_at: endedAt,
      },
    });
  }

  // A session running right now on Pool 2, so the floor shows real elapsed time.
  const running = poolTables[1];
  if (running) {
    await prisma.dunda_pool_sessions.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        pool_table_id: running.id,
        started_by_id: attendant,
        status: "ACTIVE",
        started_at: new Date(Date.now() - 42 * 60 * 1000),
        hourly_rate: POOL_RATES.friday,
      },
    });
    await prisma.dunda_pool_tables.update({
      where: { id: running.id },
      data: { status: "OCCUPIED" },
    });
  }

  void branch;
  void productIds;
  void waiter;
}

/** Bookings for tonight and the coming days, including one on a pool table. */
async function seedReservations() {
  const customers = await prisma.dunda_customers.findMany({
    where: { organization_id: ORG_ID },
    orderBy: { name: "asc" },
  });
  const poolTable = await prisma.dunda_pool_tables.findFirst({
    where: { organization_id: ORG_ID, name: "Pool 3" },
  });
  const tables = await prisma.dunda_tables.findMany({
    where: { organization_id: ORG_ID },
    orderBy: { name: "asc" },
  });

  const bookings = [
    { customer: 0, table: tables[1], hoursFromNow: 2, hours: 2, guests: 6, status: "CONFIRMED" },
    { customer: 3, table: tables[5], hoursFromNow: 3.5, hours: 3, guests: 4, status: "PENDING" },
    { customer: 4, table: tables[8], hoursFromNow: 5, hours: 2, guests: 10, status: "CONFIRMED" },
    { customer: 6, table: tables[11], hoursFromNow: 26, hours: 3, guests: 4, status: "PENDING" },
    { customer: 7, table: tables[3], hoursFromNow: 30, hours: 2, guests: 5, status: "PENDING" },
  ];

  for (const booking of bookings) {
    const customer = customers[booking.customer];
    const table = booking.table;
    if (!customer || !table) continue;
    const startsAt = new Date(Date.now() + booking.hoursFromNow * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + booking.hours * 60 * 60 * 1000);
    await prisma.dunda_reservations.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        customer_id: customer.id,
        customer: customer.name,
        phone: customer.phone ?? "+254700000000",
        reservation_date: startsAt.toISOString().slice(0, 10),
        time: startsAt.toTimeString().slice(0, 5),
        starts_at: startsAt,
        ends_at: endsAt,
        table_name: table.name,
        table_id: table.id,
        guests: booking.guests,
        status: booking.status,
      },
    });
  }

  // A pool booking, which lives on the pool table rather than a seated table.
  const poolGuest = customers[2];
  if (poolGuest && poolTable) {
    const startsAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    await prisma.dunda_reservations.create({
      data: {
        organization_id: ORG_ID,
        branch_id: BRANCH_ID,
        customer_id: poolGuest.id,
        customer: poolGuest.name,
        phone: poolGuest.phone ?? "+254700000000",
        reservation_date: startsAt.toISOString().slice(0, 10),
        time: startsAt.toTimeString().slice(0, 5),
        starts_at: startsAt,
        ends_at: endsAt,
        table_name: poolTable.name,
        pool_table_id: poolTable.id,
        guests: 4,
        status: "CONFIRMED",
      },
    });
  }

  console.log(`  ${bookings.length + 1} reservations`);
}

/** Adds a selling unit, e.g. a glass off a bottle. */
async function addUnit(
  productId: string | undefined,
  organizationId: string,
  name: string,
  abbreviation: string,
  conversionFactor: number,
  sellingPrice: number,
  isBaseUnit: boolean,
) {
  if (!productId) return;
  const unit = await prisma.dunda_product_units.create({
    data: {
      product_id: productId,
      name,
      abbreviation,
      conversion_factor: conversionFactor,
      is_base_unit: isBaseUnit,
      selling_price: sellingPrice,
      sort_order: isBaseUnit ? 0 : 1,
    },
  });

  // The conversion is also recorded as a row, so "how many glasses in a bottle"
  // is a question the club's data answers rather than one the code assumes.
  await prisma.dunda_unit_conversions.upsert({
    where: {
      product_id_from_unit_id_to_unit_id: {
        product_id: productId,
        from_unit_id: unit.id,
        to_unit_id: unit.id,
      },
    },
    create: {
      organization_id: organizationId,
      product_id: productId,
      from_unit_id: unit.id,
      to_unit_id: unit.id,
      factor: 1,
    },
    update: {},
  });
}

/** Builds a cocktail from the ingredients it actually consumes. */
async function addRecipe(
  productId: string | undefined,
  organizationId: string,
  ingredients: [string, number, string | null][],
) {
  if (!productId) return;
  const recipe = await prisma.dunda_recipes.create({
    data: {
      organization_id: organizationId,
      product_id: productId,
      name: "Standard build",
      output_quantity: 1,
      active: true,
    },
  });

  for (const [name, quantity, unitName] of ingredients) {
    const ingredientId = await productIdsByName(name);
    if (!ingredientId) continue;
    let unitId: string | null = null;
    if (unitName) {
      const unit = await prisma.dunda_product_units.findFirst({
        where: { product_id: ingredientId, name: unitName },
        select: { id: true },
      });
      unitId = unit?.id ?? null;
    }
    await prisma.dunda_recipe_ingredients.create({
      data: {
        recipe_id: recipe.id,
        product_id: ingredientId,
        unit_id: unitId,
        quantity,
      },
    });
  }
}

async function productIdsByName(name: string): Promise<string | undefined> {
  const row = await prisma.dunda_products.findFirst({
    where: { organization_id: ORG_ID, name },
    select: { id: true },
  });
  return row?.id;
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
