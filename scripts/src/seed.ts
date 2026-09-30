import { db } from "@workspace/db";
import {
  organizationMembersTable,
  organizationsTable,
  branchesTable,
  categoriesTable,
  productsTable,
  productUnitsTable,
  productBarcodesTable,
  productBranchAvailabilityTable,
  permissionsTable,
  rolesTable,
  rolePermissionsTable,
  staffTable,
  branchMembersTable,
  floorsTable,
  floorSectionsTable,
  tablesTable,
  customersTable,
  eventsTable,
  eventReservationsTable,
  vipPackagesTable,
  reservationsTable,
  staffShiftsTable,
  inventoryItemsTable,
  suppliersTable,
  stockMovementsTable,
  inventoryAlertsTable,
  auditLogsTable,
  ordersTable,
  orderItemsTable,
  orderItemUnitsTable,
  paymentsTable,
  notificationsTable,
  activityTable,
  subscriptionsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from "./permissions.js";

const ORG_ID = "org-skyline";
const BRANCH_NAIROBI = "branch-nairobi";
const BRANCH_MOMBASA = "branch-mombasa";
const BRANCH_KISUMU = "branch-kisumu";

function id(prefix: string, n: number | string): string {
  return `${prefix}-${n}`;
}

async function wipe(): Promise<void> {
  // Order matters: children before parents.
  await db.delete(notificationsTable);
  await db.delete(activityTable);
  await db.delete(paymentsTable);
  await db.delete(orderItemsTable);
  await db.delete(ordersTable);
  await db.delete(inventoryAlertsTable);
  await db.delete(stockMovementsTable);
  await db.delete(inventoryItemsTable);
  await db.delete(suppliersTable);
  await db.delete(eventReservationsTable);
  await db.delete(vipPackagesTable);
  await db.delete(reservationsTable);
  await db.delete(eventsTable);
  await db.delete(tablesTable);
  await db.delete(floorSectionsTable);
  await db.delete(floorsTable);
  await db.delete(customersTable);
  await db.delete(staffShiftsTable);
  await db.delete(branchMembersTable);
  await db.delete(organizationMembersTable);
  await db.delete(staffTable);
  await db.delete(rolePermissionsTable);
  await db.delete(rolesTable);
  await db.delete(permissionsTable);
  await db.delete(productBarcodesTable);
  await db.delete(productBranchAvailabilityTable);
  await db.delete(productUnitsTable);
  await db.delete(productsTable);
  await db.delete(categoriesTable);
  await db.delete(subscriptionsTable);
  await db.delete(auditLogsTable);
  await db.delete(branchesTable);
  await db.delete(organizationsTable);
}

async function seed() {
  // Seeding replaces demo data. Never destroy an existing database by accident:
  // pass --force to wipe, otherwise seed only when the database is empty.
  const force = process.argv.includes("--force");
  const [existing] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .limit(1);

  if (existing && !force) {
    console.log(
      `Database already contains data (org: ${existing.id}).\n` +
        "Nothing was changed. Re-run with --force to replace it with demo data.",
    );
    return;
  }

  if (existing) {
    console.log("--force given: replacing existing data with the Skyline demo set.");
  }

  await wipe();

  await db.insert(organizationsTable).values({
    id: ORG_ID,
    name: "Skyline Entertainment Group",
    slug: "skyline-entertainment",
    currency: "KES",
    taxRate: 16,
    serviceChargeRate: 10,
  });

  await db.insert(subscriptionsTable).values({
    id: "sub-skyline",
    organizationId: ORG_ID,
    plan: "ENTERPRISE",
    status: "ACTIVE",
    billingCycle: "MONTHLY",
    branchLimit: 10,
    userLimit: 100,
    currentBranches: 3,
    currentUsers: 6,
    renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  await db.insert(branchesTable).values([
    { id: BRANCH_NAIROBI, organizationId: ORG_ID, name: "The Lantern Room", city: "Nairobi", address: "123 Restaurant Street, Nairobi", status: "LIVE", timezone: "Africa/Nairobi", phone: "+254700000001", email: "nairobi@skyline.co.ke" },
    { id: BRANCH_MOMBASA, organizationId: ORG_ID, name: "Embassy Lounge", city: "Mombasa", address: "45 Moi Avenue, Mombasa", status: "LIVE", timezone: "Africa/Nairobi", phone: "+254700000002", email: "mombasa@skyline.co.ke" },
    { id: BRANCH_KISUMU, organizationId: ORG_ID, name: "Lakeside Social", city: "Kisumu", address: "8 Oginga Odinga Road, Kisumu", status: "CLOSED", timezone: "Africa/Nairobi", phone: "+254700000003", email: "kisumu@skyline.co.ke" },
  ]);

  // --- Roles and permissions -------------------------------------------------
  await db.insert(permissionsTable).values(PERMISSIONS.map((p) => ({ ...p })));
  await db.insert(rolesTable).values(ROLES.map((r) => ({ ...r })));

  const rolePermissionRows = Object.entries(ROLE_PERMISSIONS).flatMap(
    ([roleId, permissionNames]) =>
      permissionNames.map((name) => ({
        id: `rp-${roleId}-${name}`,
        roleId,
        permissionId: `perm_${name}`,
      })),
  );
  await db.insert(rolePermissionsTable).values(rolePermissionRows);

  // --- Staff -----------------------------------------------------------------
  const staffRows = [
    { id: "staff-owner", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, clerkUserId: "user_owner_demo", name: "Amina Mwangi", email: "amina@skyline.co.ke", phone: "+254711000001", roleId: "role_owner", pin: "1234" },
    { id: "staff-gm", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, clerkUserId: "user_gm_demo", name: "Daniel Otieno", email: "daniel@skyline.co.ke", phone: "+254711000002", roleId: "role_gm", pin: "2345" },
    { id: "staff-branch-manager", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, clerkUserId: "user_manager_demo", name: "Grace Njeri", email: "grace@skyline.co.ke", phone: "+254711000003", roleId: "role_branch_manager", pin: "3456" },
    { id: "staff-cashier", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, clerkUserId: "user_cashier_demo", name: "Kevin Otieno", email: "kevin@skyline.co.ke", phone: "+254711000004", roleId: "role_cashier", pin: "4567" },
    { id: "staff-waiter", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, clerkUserId: "user_waiter_demo", name: "Mercy Achieng", email: "mercy@skyline.co.ke", phone: "+254711000005", roleId: "role_waiter", pin: "5678" },
    { id: "staff-bartender", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, clerkUserId: "user_bartender_demo", name: "Joseph Kimani", email: "joseph@skyline.co.ke", phone: "+254711000006", roleId: "role_bartender", pin: "6789" },
    { id: "staff-kitchen", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, clerkUserId: "user_kitchen_demo", name: "Peter Waweru", email: "peter@skyline.co.ke", roleId: "role_kitchen", pin: "7890" },
    { id: "staff-inventory", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, clerkUserId: "user_inventory_demo", name: "Lucy Mwende", email: "lucy@skyline.co.ke", roleId: "role_inventory_manager", pin: "8901" },
    { id: "staff-events", organizationId: ORG_ID, branchId: BRANCH_MOMBASA, clerkUserId: "user_events_demo", name: "Faith Chebet", email: "faith@skyline.co.ke", roleId: "role_event_manager", pin: "9012" },
  ].map((s) => ({ ...s, status: "ACTIVE" }));
  await db.insert(staffTable).values(staffRows);

  await db.insert(organizationMembersTable).values(
    staffRows.map((s) => ({
      id: `om-${s.id}`,
      organizationId: ORG_ID,
      clerkUserId: s.clerkUserId,
      roleId: s.roleId,
      status: "ACTIVE",
    })),
  );

  await db.insert(branchMembersTable).values(
    staffRows.map((s) => ({
      id: `bm-${s.id}`,
      organizationId: ORG_ID,
      branchId: s.branchId!,
      clerkUserId: s.clerkUserId,
      roleId: s.roleId,
      status: "ACTIVE",
    })),
  );

  // --- Catalog ---------------------------------------------------------------
  await db.insert(categoriesTable).values([
    { id: "cat-beer", organizationId: ORG_ID, name: "Beer", color: "#c77c4e", sortOrder: 1 },
    { id: "cat-spirits", organizationId: ORG_ID, name: "Spirits", color: "#b08d49", sortOrder: 2 },
    { id: "cat-cocktails", organizationId: ORG_ID, name: "Cocktails", color: "#8f80a6", sortOrder: 3 },
    { id: "cat-wine", organizationId: ORG_ID, name: "Wine", color: "#b75b56", sortOrder: 4 },
    { id: "cat-food", organizationId: ORG_ID, name: "Food", color: "#6ea493", sortOrder: 5 },
    { id: "cat-soft", organizationId: ORG_ID, name: "Soft Drinks", color: "#6f9fb2", sortOrder: 6 },
    { id: "cat-cigars", organizationId: ORG_ID, name: "Cigars", color: "#8ea75f", sortOrder: 7 },
    { id: "cat-cigarettes", organizationId: ORG_ID, name: "Cigarettes", color: "#b67d8c", sortOrder: 8 },
  ]);

  // Products carry a base inventory unit. Whisky and cigars exercise the
  // portion / packaging flows the README calls out explicitly.
  const products = [
    { id: "prod-tusker", categoryId: "cat-beer", name: "Tusker Lager", category: "Beer", baseUnit: "bottle", unit: "bottle", sku: "BEER-TUSK", barcode: "6001000000015", cost: 180, price: 250, tax: 16, accent: "gold" },
    { id: "prod-jameson", categoryId: "cat-spirits", name: "Jameson Irish Whiskey", category: "Spirits", baseUnit: "ml", unit: "bottle", sku: "SPIR-JAME", barcode: "6001000000022", cost: 3200, price: 8000, tax: 16, accent: "amber" },
    { id: "prod-cigar", categoryId: "cat-cigars", name: "Cigar", category: "Cigars", baseUnit: "piece", unit: "piece", sku: "CIG-001", barcode: "6001000000039", cost: 350, price: 500, tax: 16, accent: "mint" },
    { id: "prod-mojito", categoryId: "cat-cocktails", name: "Mojito", category: "Cocktails", baseUnit: "piece", unit: "glass", sku: "COCK-MOJI", barcode: "6001000000046", cost: 250, price: 800, tax: 16, accent: "cyan" },
    { id: "prod-gin-tonic", categoryId: "cat-cocktails", name: "Gin & Tonic", category: "Cocktails", baseUnit: "piece", unit: "glass", sku: "COCK-GT", barcode: "6001000000053", cost: 300, price: 900, tax: 16, accent: "sky" },
    { id: "prod-nyama", categoryId: "cat-food", name: "Nyama Choma", category: "Food", baseUnit: "plate", unit: "plate", sku: "FOOD-NYAMA", barcode: "6001000000060", cost: 600, price: 1200, tax: 16, accent: "red" },
    { id: "prod-wine-merlot", categoryId: "cat-wine", name: "Merlot", category: "Wine", baseUnit: "bottle", unit: "glass", sku: "WINE-MER", barcode: "6001000000077", cost: 900, price: 1500, tax: 16, accent: "rose" },
    { id: "prod-coke", categoryId: "cat-soft", name: "Coca-Cola", category: "Soft Drinks", baseUnit: "bottle", unit: "bottle", sku: "SOFT-COKE", barcode: "6001000000084", cost: 70, price: 150, tax: 16, accent: "red" },
    { id: "prod-water", categoryId: "cat-soft", name: "Still Water", category: "Soft Drinks", baseUnit: "bottle", unit: "bottle", sku: "SOFT-WAT", barcode: "6001000000091", cost: 30, price: 100, tax: 16, accent: "sky" },
    { id: "prod-cigs", categoryId: "cat-cigarettes", name: "Cigarettes", category: "Cigarettes", baseUnit: "piece", unit: "pack", sku: "CIGT-001", barcode: "6001000000107", cost: 180, price: 300, tax: 16, accent: "violet" },
  ].map((p) => ({
    ...p,
    organizationId: ORG_ID,
    trackInventory: true,
    active: true,
    available: "true",
    stock: "0",
  }));
  await db.insert(productsTable).values(products);

  // Whisky: base unit is ml. Shot 30ml, Glass 60ml, Bottle 750ml.
  await db.insert(productUnitsTable).values([
    { id: "unit-jameson-shot", productId: "prod-jameson", name: "Shot", abbreviation: "SHOT", conversionFactor: "30", isBaseUnit: false, sellingPrice: 500, cost: 130, wholeUnitsOnly: true, sortOrder: 1 },
    { id: "unit-jameson-glass", productId: "prod-jameson", name: "Glass", abbreviation: "GLS", conversionFactor: "60", isBaseUnit: false, sellingPrice: 1000, cost: 260, wholeUnitsOnly: true, sortOrder: 2 },
    { id: "unit-jameson-bottle", productId: "prod-jameson", name: "Bottle", abbreviation: "BTL", conversionFactor: "750", isBaseUnit: true, sellingPrice: 8000, cost: 3200, wholeUnitsOnly: true, sortOrder: 3 },
    { id: "unit-cigar-piece", productId: "prod-cigar", name: "Piece", abbreviation: "PC", conversionFactor: "1", isBaseUnit: true, sellingPrice: 500, cost: 350, wholeUnitsOnly: true, sortOrder: 1 },
    { id: "unit-tusker-bottle", productId: "prod-tusker", name: "Bottle", abbreviation: "BTL", conversionFactor: "1", isBaseUnit: true, sellingPrice: 250, cost: 180, wholeUnitsOnly: true, sortOrder: 1 },
    { id: "unit-mojito-glass", productId: "prod-mojito", name: "Glass", abbreviation: "GLS", conversionFactor: "1", isBaseUnit: true, sellingPrice: 800, cost: 250, wholeUnitsOnly: true, sortOrder: 1 },
    { id: "unit-gt-glass", productId: "prod-gin-tonic", name: "Glass", abbreviation: "GLS", conversionFactor: "1", isBaseUnit: true, sellingPrice: 900, cost: 300, wholeUnitsOnly: true, sortOrder: 1 },
    { id: "unit-nyama-plate", productId: "prod-nyama", name: "Plate", abbreviation: "PLT", conversionFactor: "1", isBaseUnit: true, sellingPrice: 1200, cost: 600, wholeUnitsOnly: true, sortOrder: 1 },
    { id: "unit-merlot-glass", productId: "prod-wine-merlot", name: "Glass", abbreviation: "GLS", conversionFactor: "150", isBaseUnit: false, sellingPrice: 1500, cost: 900, wholeUnitsOnly: true, sortOrder: 1 },
    { id: "unit-merlot-bottle", productId: "prod-wine-merlot", name: "Bottle", abbreviation: "BTL", conversionFactor: "750", isBaseUnit: true, sellingPrice: 4500, cost: 2700, wholeUnitsOnly: true, sortOrder: 2 },
    { id: "unit-coke-bottle", productId: "prod-coke", name: "Bottle", abbreviation: "BTL", conversionFactor: "1", isBaseUnit: true, sellingPrice: 150, cost: 70, wholeUnitsOnly: true, sortOrder: 1 },
    { id: "unit-water-bottle", productId: "prod-water", name: "Bottle", abbreviation: "BTL", conversionFactor: "1", isBaseUnit: true, sellingPrice: 100, cost: 30, wholeUnitsOnly: true, sortOrder: 1 },
    { id: "unit-cigs-pack", productId: "prod-cigs", name: "Pack", abbreviation: "PK", conversionFactor: "20", isBaseUnit: false, sellingPrice: 300, cost: 180, wholeUnitsOnly: true, sortOrder: 1 },
    { id: "unit-cigs-piece", productId: "prod-cigs", name: "Piece", abbreviation: "PC", conversionFactor: "1", isBaseUnit: true, sellingPrice: 20, cost: 9, wholeUnitsOnly: true, sortOrder: 2 },
  ]);

  // Barcodes resolve to a specific selling unit, per the README flow.
  await db.insert(productBarcodesTable).values([
    { id: "bc-tusker", productId: "prod-tusker", barcode: "6001000000015", unitId: "unit-tusker-bottle" },
    { id: "bc-jameson", productId: "prod-jameson", barcode: "6001000000022", unitId: "unit-jameson-shot" },
    { id: "bc-cigar", productId: "prod-cigar", barcode: "6001000000039", unitId: "unit-cigar-piece" },
    { id: "bc-mojito", productId: "prod-mojito", barcode: "6001000000046", unitId: "unit-mojito-glass" },
    { id: "bc-gt", productId: "prod-gin-tonic", barcode: "6001000000053", unitId: "unit-gt-glass" },
    { id: "bc-nyama", productId: "prod-nyama", barcode: "6001000000060", unitId: "unit-nyama-plate" },
    { id: "bc-merlot", productId: "prod-wine-merlot", barcode: "6001000000077", unitId: "unit-merlot-glass" },
    { id: "bc-coke", productId: "prod-coke", barcode: "6001000000084", unitId: "unit-coke-bottle" },
    { id: "bc-water", productId: "prod-water", barcode: "6001000000091", unitId: "unit-water-bottle" },
    { id: "bc-cigs", productId: "prod-cigs", barcode: "6001000000107", unitId: "unit-cigs-pack" },
  ]);

  await db.insert(productBranchAvailabilityTable).values(
    products.flatMap((p) =>
      [BRANCH_NAIROBI, BRANCH_MOMBASA, BRANCH_KISUMU].map((branchId) => ({
        id: `pba-${p.id}-${branchId}`,
        productId: p.id,
        branchId,
        price: null,
        trackInventory: true,
        available: true,
      })),
    ),
  );

  // --- Inventory -------------------------------------------------------------
  await db.insert(inventoryItemsTable).values([
    // 5 boxes x 20 pieces = 100 pieces of cigar stock.
    { id: "inv-cigar", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-cigar", name: "Cigar", category: "Cigars", sku: "CIG-001", unit: "piece", currentQuantity: "100", reorderLevel: "20", cost: 350 },
    { id: "inv-jameson", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-jameson", name: "Jameson Irish Whiskey", category: "Spirits", sku: "SPIR-JAME", unit: "ml", currentQuantity: "15000", reorderLevel: "3000", cost: 3200 },
    { id: "inv-tusker", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-tusker", name: "Tusker Lager", category: "Beer", sku: "BEER-TUSK", unit: "bottle", currentQuantity: "84", reorderLevel: "24", cost: 180 },
    { id: "inv-mojito", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-mojito", name: "Mojito", category: "Cocktails", sku: "COCK-MOJI", unit: "piece", currentQuantity: "40", reorderLevel: "20", cost: 250 },
    { id: "inv-gt", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-gin-tonic", name: "Gin & Tonic", category: "Cocktails", sku: "COCK-GT", unit: "piece", currentQuantity: "36", reorderLevel: "20", cost: 300 },
    { id: "inv-nyama", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-nyama", name: "Nyama Choma", category: "Food", sku: "FOOD-NYAMA", unit: "plate", currentQuantity: "18", reorderLevel: "10", cost: 600 },
    { id: "inv-merlot", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-wine-merlot", name: "Merlot", category: "Wine", sku: "WINE-MER", unit: "bottle", currentQuantity: "12", reorderLevel: "6", cost: 2700 },
    { id: "inv-coke", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-coke", name: "Coca-Cola", category: "Soft Drinks", sku: "SOFT-COKE", unit: "bottle", currentQuantity: "96", reorderLevel: "24", cost: 70 },
    { id: "inv-water", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-water", name: "Still Water", category: "Soft Drinks", sku: "SOFT-WAT", unit: "bottle", currentQuantity: "150", reorderLevel: "36", cost: 30 },
    { id: "inv-cigs", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-cigs", name: "Cigarettes", category: "Cigarettes", sku: "CIGT-001", unit: "piece", currentQuantity: "400", reorderLevel: "100", cost: 9 },
  ]);

  await db.insert(suppliersTable).values([
    { id: "sup-1", organizationId: ORG_ID, name: "Kenya Distillers Ltd", contact: "Samuel Kimani", phone: "+254722000001", email: "orders@kenyadistillers.co.ke", address: "Industrial Area, Nairobi" },
    { id: "sup-2", organizationId: ORG_ID, name: "Highland Tobacco", contact: "Alice Wanjiku", phone: "+254722000002", email: "sales@highlandtobacco.co.ke", address: "Mombasa Road, Nairobi" },
  ]);

  await db.insert(inventoryAlertsTable).values([
    { id: "alert-nyama", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-nyama", name: "Nyama Choma", category: "Food", stock: "18", minimum: "10", unit: "plate", severity: "LOW" },
    { id: "alert-merlot", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, productId: "prod-wine-merlot", name: "Merlot", category: "Wine", stock: "12", minimum: "6", unit: "bottle", severity: "LOW" },
  ]);

  // --- Floor and tables ------------------------------------------------------
  await db.insert(floorsTable).values([
    { id: "floor-nairobi-main", branchId: BRANCH_NAIROBI, name: "Main Floor", sortOrder: 1 },
    { id: "floor-mombasa-main", branchId: BRANCH_MOMBASA, name: "Main Floor", sortOrder: 1 },
  ]);

  const sectionDefs = [
    { id: "sec-nai-main", floorId: "floor-nairobi-main", name: "Main Floor", color: "#6ea493", sortOrder: 1 },
    { id: "sec-nai-lounge", floorId: "floor-nairobi-main", name: "Lounge", color: "#8f80a6", sortOrder: 2 },
    { id: "sec-nai-vip", floorId: "floor-nairobi-main", name: "VIP", color: "#b08d49", sortOrder: 3 },
    { id: "sec-nai-outdoor", floorId: "floor-nairobi-main", name: "Outdoor", color: "#6f9fb2", sortOrder: 4 },
    { id: "sec-nai-bar", floorId: "floor-nairobi-main", name: "Bar", color: "#c77c4e", sortOrder: 5 },
    { id: "sec-mom-main", floorId: "floor-mombasa-main", name: "Main Floor", color: "#6ea493", sortOrder: 1 },
    { id: "sec-mom-vip", floorId: "floor-mombasa-main", name: "VIP", color: "#b08d49", sortOrder: 2 },
  ];
  await db.insert(floorSectionsTable).values(sectionDefs);

  const nairobiSections = sectionDefs.filter((s) => s.floorId === "floor-nairobi-main");
  const tableRows = nairobiSections.flatMap((section, sectionIndex) => {
    const count = section.name === "VIP" ? 4 : 6;
    return Array.from({ length: count }, (_, i) => {
      const n = sectionIndex * 10 + i + 1;
      const isVip = section.name === "VIP";
      return {
        id: `table-nai-${n}`,
        organizationId: ORG_ID,
        branchId: BRANCH_NAIROBI,
        floorId: "floor-nairobi-main",
        floorSectionId: section.id,
        name: isVip ? `VIP ${String(i + 1).padStart(2, "0")}` : `T${String(n).padStart(2, "0")}`,
        section: section.name,
        seats: isVip ? 8 : 4,
        status: i % 5 === 0 ? "RESERVED" : "AVAILABLE",
        total: 0,
        x: (i % 3) * 180,
        y: Math.floor(i / 3) * 160,
        width: isVip ? 180 : 150,
        height: isVip ? 180 : 150,
      };
    });
  });
  tableRows.push(
    ...sectionDefs
      .filter((s) => s.floorId === "floor-mombasa-main")
      .flatMap((section, sectionIndex) =>
        Array.from({ length: section.name === "VIP" ? 3 : 5 }, (_, i) => {
          const n = sectionIndex * 10 + i + 1;
          return {
            id: `table-mom-${n}`,
            organizationId: ORG_ID,
            branchId: BRANCH_MOMBASA,
            floorId: "floor-mombasa-main",
            floorSectionId: section.id,
            name: section.name === "VIP" ? `VIP ${String(i + 1).padStart(2, "0")}` : `M${String(n).padStart(2, "0")}`,
            section: section.name,
            seats: section.name === "VIP" ? 8 : 4,
            status: "AVAILABLE",
            total: 0,
            x: (i % 3) * 180,
            y: Math.floor(i / 3) * 160,
            width: 150,
            height: 150,
          };
        }),
      ),
  );
  await db.insert(tablesTable).values(tableRows);

  // --- Customers -------------------------------------------------------------
  await db.insert(customersTable).values([
    { id: "cust-1", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, name: "Alice Wanjiru", phone: "+254711001001", email: "alice@example.com", vipLevel: "SILVER", totalVisits: 12, totalSpend: 15000, lastVisitAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), notes: "Prefers a quiet corner table." },
    { id: "cust-2", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, name: "Carol Mwangi", phone: "+254713003003", email: "carol@example.com", vipLevel: "PLATINUM", totalVisits: 48, totalSpend: 185000, lastVisitAt: new Date(Date.now() - 24 * 60 * 60 * 1000), notes: "Corporate bookings. Always confirm table in advance." },
    { id: "cust-3", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, name: "Bob Ochieng", phone: "+254712002002", email: "bob@example.com", vipLevel: "NONE", totalVisits: 3, totalSpend: 3200, lastVisitAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    { id: "cust-4", organizationId: ORG_ID, branchId: BRANCH_MOMBASA, name: "Nadia Hassan", phone: "+254714004004", email: "nadia@example.com", vipLevel: "GOLD", totalVisits: 22, totalSpend: 96000, lastVisitAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
  ]);

  // --- Events, VIP, reservations --------------------------------------------
  const today = new Date();
  const inDays = (n: number) => new Date(today.getTime() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await db.insert(eventsTable).values([
    { id: "evt-1", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, name: "Salsa Friday", description: "Live salsa band and dance floor from 9pm.", date: inDays(2), startTime: "21:00", endTime: "02:00", capacity: 120, status: "UPCOMING" },
    { id: "evt-2", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, name: "Whisky Tasting", description: "Guided tasting of six single malts.", date: inDays(9), startTime: "19:00", endTime: "22:00", capacity: 40, status: "UPCOMING" },
    { id: "evt-3", organizationId: ORG_ID, branchId: BRANCH_MOMBASA, name: "Lakeside Sunset", description: "Dinner and cocktails on the terrace.", date: inDays(5), startTime: "17:00", endTime: "21:00", capacity: 80, status: "UPCOMING" },
  ]);

  await db.insert(eventReservationsTable).values([
    { id: "er-1", eventId: "evt-1", customerId: "cust-1", guests: 2, status: "CONFIRMED" },
    { id: "er-2", eventId: "evt-1", customerId: "cust-2", guests: 6, status: "PENDING" },
    { id: "er-3", eventId: "evt-2", customerId: "cust-3", guests: 4, status: "PENDING" },
  ]);

  await db.insert(vipPackagesTable).values([
    { id: "vip-1", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, name: "VIP Table 04", description: "Reserved VIP floor table with bottle service.", minimumSpend: 50000, guestCount: 8, tableId: "table-nai-25", status: "RESERVED" },
    { id: "vip-2", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, name: "Executive Booth", description: "Semi-private booth, dedicated waiter.", minimumSpend: 120000, guestCount: 12, tableId: "table-nai-26", status: "AVAILABLE" },
  ]);

  await db.insert(reservationsTable).values([
    { id: "res-1", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, customerId: "cust-1", customer: "Alice Wanjiru", phone: "+254711001001", reservationDate: inDays(0), time: "20:00", tableName: "T03", guests: 2, status: "CONFIRMED", notes: "Window seat if possible." },
    { id: "res-2", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, customerId: "cust-2", customer: "Carol Mwangi", phone: "+254713003003", reservationDate: inDays(0), time: "21:30", tableName: "VIP 01", guests: 6, status: "PENDING", notes: "Corporate booking, minimum spend applies." },
    { id: "res-3", organizationId: ORG_ID, branchId: BRANCH_MOMBASA, customerId: "cust-4", customer: "Nadia Hassan", phone: "+254714004004", reservationDate: inDays(1), time: "19:00", tableName: "M02", guests: 4, status: "CONFIRMED" },
  ]);

  // --- Shifts ----------------------------------------------------------------
  await db.insert(staffShiftsTable).values([
    { id: "shift-1", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, staffId: "staff-waiter", clockInAt: new Date(Date.now() - 4 * 60 * 60 * 1000), status: "RUNNING" },
    { id: "shift-2", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, staffId: "staff-bartender", clockInAt: new Date(Date.now() - 3 * 60 * 60 * 1000), status: "RUNNING" },
    { id: "shift-3", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, staffId: "staff-kitchen", clockInAt: new Date(Date.now() - 5 * 60 * 60 * 1000), status: "RUNNING" },
    { id: "shift-4", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, staffId: "staff-cashier", clockInAt: new Date(Date.now() - 6 * 60 * 60 * 1000), breakStartAt: new Date(Date.now() - 60 * 60 * 1000), breakEndAt: new Date(Date.now() - 30 * 60 * 1000), status: "RUNNING" },
  ]);

  // --- Historical orders, payments, stock movements ---------------------------
  const orderSeeds = [
    { id: "ord-seed-1", number: "#ORD-000123", status: "COMPLETED", hoursAgo: 3, staffId: "staff-waiter", items: [{ productId: "prod-tusker", unitId: "unit-tusker-bottle", qty: 6 }, { productId: "prod-nyama", unitId: "unit-nyama-plate", qty: 2 }], method: "MPESA" },
    { id: "ord-seed-2", number: "#ORD-000124", status: "COMPLETED", hoursAgo: 2, staffId: "staff-waiter", items: [{ productId: "prod-cigar", unitId: "unit-cigar-piece", qty: 3 }], method: "CASH" },
    { id: "ord-seed-3", number: "#ORD-000125", status: "SERVED", hoursAgo: 1, staffId: "staff-waiter", items: [{ productId: "prod-jameson", unitId: "unit-jameson-shot", qty: 2 }, { productId: "prod-mojito", unitId: "unit-mojito-glass", qty: 4 }], method: null },
    { id: "ord-seed-4", number: "#ORD-000126", status: "PREPARING", hoursAgo: 0, staffId: "staff-waiter", items: [{ productId: "prod-gt", unitId: "unit-gt-glass", qty: 3 }], method: null },
  ];

  for (const seed of orderSeeds) {
    const createdAt = new Date(Date.now() - seed.hoursAgo * 60 * 60 * 1000);
    let subtotal = 0;
    const items = seed.items.map((it) => {
      const product = products.find((p) => p.id === it.productId)!;
      const unit = it.unitId;
      const total = product.price * it.qty;
      subtotal += total;
      return { product, unitId: unit, qty: it.qty, total };
    });
    const serviceCharge = Math.round(subtotal * 0.1);
    const tax = Math.round((subtotal + serviceCharge) * 0.16);
    const total = subtotal + serviceCharge + tax;

    await db.insert(ordersTable).values({
      id: seed.id,
      organizationId: ORG_ID,
      branchId: BRANCH_NAIROBI,
      number: seed.number,
      tableName: seed.id === "ord-seed-2" ? "VIP 02" : "T05",
      customerId: null,
      staffId: seed.staffId,
      status: seed.status,
      subtotal,
      serviceCharge,
      tax,
      discount: 0,
      total,
      createdAt,
      updatedAt: createdAt,
    });

    for (const it of items) {
      const unitRow = (
        await db.select().from(productUnitsTable).where(eq(productUnitsTable.id, it.unitId))
      )[0];
      const conversionFactor = unitRow ? Number(unitRow.conversionFactor) : 1;
      const orderItemId = `oi-${seed.id}-${it.product.id}`;
      await db.insert(orderItemsTable).values({
        id: orderItemId,
        orderId: seed.id,
        productId: it.product.id,
        unitId: it.unitId,
        name: it.product.name,
        quantity: it.qty,
        unitPrice: unitRow?.sellingPrice ?? it.product.price,
        total: it.total,
        categoryId: it.product.categoryId,
      });
      await db.insert(orderItemUnitsTable).values({
        id: `oiu-${seed.id}-${it.product.id}`,
        orderItemId,
        unitId: it.unitId,
        unitName: unitRow?.name ?? it.product.baseUnit,
        conversionFactor: String(conversionFactor),
        quantityInBaseUnit: String(it.qty * conversionFactor),
      });

      if (seed.status === "COMPLETED") {
        await db.insert(stockMovementsTable).values({
          id: `sm-${seed.id}-${it.product.id}`,
          organizationId: ORG_ID,
          branchId: BRANCH_NAIROBI,
          productId: it.product.id,
          type: "SALE",
          quantity: String(it.qty),
          quantityInBaseUnit: String(-(it.qty * conversionFactor)),
          unitId: it.unitId,
          referenceId: seed.id,
          staffId: seed.staffId,
          createdAt,
        });
      }
    }

    if (seed.method) {
      await db.insert(paymentsTable).values({
        id: `pay-${seed.id}`,
        organizationId: ORG_ID,
        branchId: BRANCH_NAIROBI,
        orderId: seed.id,
        amount: total,
        method: seed.method,
        reference: seed.method === "MPESA" ? `QJG${Math.random().toString(36).slice(2, 8).toUpperCase()}` : null,
        status: "SUCCESSFUL",
        cashierId: "staff-cashier",
        paidAt: createdAt,
      });
    }

    if (seed.status === "COMPLETED") {
      await db.insert(activityTable).values({
        id: `act-${seed.id}`,
        organizationId: ORG_ID,
        branchId: BRANCH_NAIROBI,
        type: "PAYMENT",
        title: "Payment completed",
        detail: `${seed.number} · ${seed.method ?? ""}`,
        amount: total,
        timestamp: createdAt,
      });
    }
  }

  // Aggregate branch counters from the seeded completed orders.
  await db
    .update(branchesTable)
    .set({
      revenueToday: sql`(select coalesce(sum(total),0) from ${ordersTable} where ${ordersTable.branchId} = ${BRANCH_NAIROBI} and ${ordersTable.status} = 'COMPLETED')`,
      activeTables: sql`(select count(*)::int from ${tablesTable} where ${tablesTable.branchId} = ${BRANCH_NAIROBI} and ${tablesTable.status} = 'OCCUPIED')`,
      totalTables: sql`(select count(*)::int from ${tablesTable} where ${tablesTable.branchId} = ${BRANCH_NAIROBI})`,
    })
    .where(eq(branchesTable.id, BRANCH_NAIROBI));

  await db.insert(notificationsTable).values([
    { id: "notif-1", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, staffId: "staff-owner", type: "RESERVATION", title: "New reservation", message: "Carol Mwangi requested VIP 01 for 6 guests at 21:30.", read: "false", referenceId: "res-2" },
    { id: "notif-2", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, staffId: "staff-owner", type: "LOW_STOCK", title: "Low stock", message: "Nyama Choma is below its reorder level.", read: "false", referenceId: "alert-nyama" },
    { id: "notif-3", organizationId: ORG_ID, branchId: BRANCH_NAIROBI, staffId: "staff-owner", type: "ORDER_READY", title: "Order ready", message: "#ORD-000125 is ready to serve.", read: "true", referenceId: "ord-seed-3" },
  ]);

  await db.insert(auditLogsTable).values({
    id: "audit-seed",
    organizationId: ORG_ID,
    branchId: BRANCH_NAIROBI,
    staffId: "staff-owner",
    action: "CREATE",
    entity: "ORGANIZATION",
    entityId: ORG_ID,
    detail: "Demo data seeded",
    createdAt: new Date(),
  });

  console.log("Seed complete: Skyline Entertainment Group (3 branches, 11 roles, 24 permissions)");
  console.log("Demo org: " + ORG_ID);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
