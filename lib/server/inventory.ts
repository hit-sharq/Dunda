import { prisma } from "@/lib/db/client";
import { conflict, notFound, wrongState } from "@/lib/errors.server";
import { orgWhere } from "./http";
import { recalculateTab } from "./pool";

/**
 * Inventory moves because something happened on the floor, never because a screen
 * asked for a different number. Every write here produces a movement row, so the
 * current quantity can always be explained by the movements behind it.
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Categories that come off the bar as a drink rather than as food. */
const NON_STOCK_CATEGORIES = new Set(["POOL"]);

export interface SaleLine {
  productId: string;
  quantity: number;
  unitId: string | null;
}

/**
 * Works out how much base-unit stock one sale consumes.
 *
 * A bottle sold as a single unit draws the whole bottle. A bottle sold as a glass
 * draws one glass, converted through the unit's factor rather than by a hardcoded
 * "a bottle is six glasses" rule.
 */
async function resolveDeduction(
  tx: Tx,
  organizationId: string,
  lines: SaleLine[],
): Promise<{ productId: string; quantity: number; reference: string }[]> {
  if (lines.length === 0) return [];

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await tx.dunda_products.findMany({
    where: orgWhere(organizationId, { id: { in: productIds } }),
    select: {
      id: true,
      name: true,
      category: true,
      track_inventory: true,
      dunda_product_units: {
        select: { id: true, name: true, conversion_factor: true, is_base_unit: true },
      },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Recipes expand a prepared product into the ingredients it consumes, so a
  // cocktail draws its spirit rather than counting itself as stock.
  const recipes = await tx.dunda_recipes.findMany({
    where: orgWhere(organizationId, { product_id: { in: productIds }, active: true }),
    select: {
      product_id: true,
      output_quantity: true,
      dunda_recipe_ingredients: {
        select: {
          product_id: true,
          quantity: true,
          waste_factor: true,
          unit_id: true,
          dunda_product_units: { select: { conversion_factor: true } },
        },
      },
    },
  });
  const recipeByProduct = new Map(recipes.map((r) => [r.product_id, r]));

  const deductions: { productId: string; quantity: number; reference: string }[] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) throw notFound("One of the products on this order");
    if (!product.track_inventory) continue;
    if (NON_STOCK_CATEGORIES.has(product.category.toUpperCase())) continue;

    const recipe = recipeByProduct.get(line.productId);
    if (recipe) {
      // Each prepared unit consumes the recipe divided by its output. A recipe
      // that yields two glasses draws half its ingredients per glass.
      const yields = Number(recipe.output_quantity) || 1;
      const times = line.quantity / yields;
      for (const ingredient of recipe.dunda_recipe_ingredients) {
        const factor = Number(ingredient.dunda_product_units?.conversion_factor ?? 1);
        const quantity = Number(ingredient.quantity) * times * factor * Number(ingredient.waste_factor);
        if (quantity > 0) {
          deductions.push({
            productId: ingredient.product_id,
            quantity,
            reference: product.name,
          });
        }
      }
      continue;
    }

    const unit = line.unitId
      ? product.dunda_product_units.find((u) => u.id === line.unitId)
      : product.dunda_product_units.find((u) => u.is_base_unit);

    const factor = Number(unit?.conversion_factor ?? 1);
    deductions.push({
      productId: product.id,
      quantity: line.quantity * factor,
      reference: product.name,
    });
  }

  // Two lines for the same product are one deduction, or the second would only
  // see the first one's movement and under-draw.
  const merged = new Map<string, { productId: string; quantity: number; reference: string }>();
  for (const d of deductions) {
    const existing = merged.get(d.productId);
    if (existing) existing.quantity += d.quantity;
    else merged.set(d.productId, { ...d });
  }
  return [...merged.values()];
}

/** Records a movement and moves the stock in the same transaction. */
async function applyMovement(
  tx: Tx,
  input: {
    organizationId: string;
    branchId: string;
    productId: string;
    type: string;
    quantity: number;
    referenceId?: string | null;
    reason?: string | null;
    staffId?: string | null;
  },
) {
  // Signed: a sale is negative, a receipt positive. The sign is what lets the
  // running quantity be a sum of movements rather than a running counter that
  // can drift.
  const signed = input.type === "SALE" || input.type === "WASTE" || input.type === "TRANSFER_OUT"
    ? -Math.abs(input.quantity)
    : Math.abs(input.quantity);

  const item = await tx.dunda_inventory_items.findFirst({
    where: orgWhere(input.organizationId, {
      product_id: input.productId,
      branch_id: input.branchId,
    }),
  });

  if (item) {
    const next = Number(item.current_quantity) + signed;
    await tx.dunda_inventory_items.update({
      where: { id: item.id },
      data: { current_quantity: next },
    });
  } else if (input.type !== "SALE") {
    // A stock row is created on the first movement so the shelf has a record to
    // hold the quantity. The name is copied from the product because this screen
    // reads it without joining.
    const product = await tx.dunda_products.findUnique({
      where: { id: input.productId },
      select: { name: true, category: true, sku: true, minimum_stock: true },
    });
    if (!product) throw notFound("That product");

    await tx.dunda_inventory_items.create({
      data: {
        organization_id: input.organizationId,
        branch_id: input.branchId,
        product_id: input.productId,
        name: product.name,
        category: product.category,
        sku: product.sku,
        current_quantity: signed,
        reorder_level: Number(product.minimum_stock ?? 0),
      },
    });
  }

  await tx.dunda_products.update({
    where: { id: input.productId },
    data: { stock: { increment: signed } },
  });

  await tx.dunda_stock_movements.create({
    data: {
      organization_id: input.organizationId,
      branch_id: input.branchId,
      product_id: input.productId,
      type: input.type,
      quantity: Math.abs(input.quantity),
      quantity_in_base_unit: Math.abs(input.quantity),
      reference_id: input.referenceId ?? null,
      reason: input.reason ?? null,
      staff_id: input.staffId ?? null,
    },
  });

  return signed;
}

/**
 * Draws stock for a completed sale. Called inside the order transaction so the
 * order and the movements commit together: an order that sold without moving
 * stock would leave the reports and the shelf disagreeing.
 */
export async function deductForSale(
  tx: Tx,
  input: {
    organizationId: string;
    branchId: string;
    referenceId: string;
    lines: SaleLine[];
    staffId: string | null;
  },
) {
  const deductions = await resolveDeduction(tx, input.organizationId, input.lines);
  for (const d of deductions) {
    await applyMovement(tx, {
      organizationId: input.organizationId,
      branchId: input.branchId,
      productId: d.productId,
      type: "SALE",
      quantity: d.quantity,
      referenceId: input.referenceId,
      reason: d.reference,
      staffId: input.staffId,
    });
  }
  await refreshLowStockAlerts(tx, input.organizationId, input.branchId);
}

/**
 * Puts stock back when a sale is voided. The movements are reversed rather than
 * the quantity being edited, so the audit trail shows both the sale and its undo.
 */
export async function reverseForVoid(
  tx: Tx,
  input: {
    organizationId: string;
    branchId: string;
    referenceId: string;
    lines: SaleLine[];
    staffId: string | null;
    reason: string;
  },
) {
  const deductions = await resolveDeduction(tx, input.organizationId, input.lines);
  for (const d of deductions) {
    await applyMovement(tx, {
      organizationId: input.organizationId,
      branchId: input.branchId,
      productId: d.productId,
      type: "RETURN",
      quantity: d.quantity,
      referenceId: input.referenceId,
      reason: input.reason,
      staffId: input.staffId,
    });
  }
  await refreshLowStockAlerts(tx, input.organizationId, input.branchId);
}

/** A manager's stock count adjustment, always with a reason. */
export async function adjustStock(
  tx: Tx,
  input: {
    organizationId: string;
    branchId: string;
    productId: string;
    quantity: number;
    reason: string;
    staffId: string | null;
    referenceId?: string | null;
  },
) {
  if (input.quantity === 0) {
    throw wrongState("An adjustment has to change the quantity by something.");
  }
  if (!input.reason.trim()) {
    throw wrongState("An adjustment needs a reason for the audit trail.");
  }

  const delta = await applyMovement(tx, {
    organizationId: input.organizationId,
    branchId: input.branchId,
    productId: input.productId,
    type: "ADJUSTMENT",
    quantity: Math.abs(input.quantity),
    referenceId: input.referenceId ?? null,
    reason: input.reason,
    staffId: input.staffId,
  });

  await refreshLowStockAlerts(tx, input.organizationId, input.branchId);
  return delta;
}

/**
 * Rebuilds the low-stock list from the current quantities.
 *
 * This runs after every movement rather than on a timer, so a bar that sells its
 * last crate sees the warning on the same request that emptied the shelf.
 */
export async function refreshLowStockAlerts(
  tx: Tx,
  organizationId: string,
  branchId: string,
) {
  const items = await tx.dunda_inventory_items.findMany({
    where: orgWhere(organizationId, { branch_id: branchId }),
    select: {
      id: true,
      product_id: true,
      current_quantity: true,
      reorder_level: true,
      dunda_products: { select: { name: true, category: true, minimum_stock: true } },
    },
  });

  await tx.dunda_inventory_alerts.deleteMany({
    where: orgWhere(organizationId, { branch_id: branchId }),
  });

  const alerts = items.flatMap((item) => {
    const current = Number(item.current_quantity);
    // A product may carry its own minimum instead of an inventory-level reorder
    // point; whichever is higher is the one the club asked to be warned at.
    const threshold = Math.max(
      Number(item.reorder_level),
      Number(item.dunda_products?.minimum_stock ?? 0),
    );
    // Without a product there is nothing to name or to key the warning to.
    if (!item.product_id || !item.dunda_products) return [];
    if (current > threshold) return [];
    return [
      {
        organization_id: organizationId,
        branch_id: branchId,
        product_id: item.product_id,
        name: item.dunda_products.name,
        category: item.dunda_products.category,
        stock: current,
        minimum: threshold,
        unit: "piece",
        severity: current <= 0 ? "OUT" : "LOW",
      },
    ];
  });

  if (alerts.length > 0) {
    await tx.dunda_inventory_alerts.createMany({ data: alerts });
  }
}
