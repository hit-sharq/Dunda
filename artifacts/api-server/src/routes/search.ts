import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  customersTable,
  eventsTable,
  ordersTable,
  productsTable,
  reservationsTable,
  staffTable,
  stockMovementsTable,
  stockTransfersTable,
  tablesTable,
  tabsTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import type { StaffContext } from "../lib/permissions";

const router: IRouter = Router();

function can(req: any, permission: string): boolean {
  const ctx: StaffContext | undefined = req.clerk?.__staffContext;
  if (!ctx) return false;
  return ctx.isOwner || ctx.permissions.has(permission);
}

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Cross-entity search backing the Cmd/Ctrl+K palette. Every result is scoped to
 * the caller's organization, and entity groups are gated on the permissions that
 * already protect their own endpoints.
 */
router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = z.object({ q: z.string().min(1) }).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "A search term is required" });
    return;
  }
  const term = parsed.data.q.trim();
  if (term.length < 2) {
    res.json({ results: [] });
    return;
  }
  const pattern = `%${term}%`;
  const org = tenant.organizationId;
  const results: SearchResult[] = [];

  if (can(req, "view_pos")) {
    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        category: productsTable.category,
        price: productsTable.price,
        barcode: productsTable.barcode,
      })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.organizationId, org),
          or(
            ilike(productsTable.name, pattern),
            ilike(productsTable.sku, pattern),
            ilike(productsTable.barcode, pattern),
          ),
        ),
      )
      .limit(6);
    results.push(
      ...products.map((p) => ({
        type: "product",
        id: p.id,
        title: p.name,
        subtitle: `${p.category} · KES ${p.price}`,
        href: "/products",
      })),
    );

    const orders = await db
      .select({
        id: ordersTable.id,
        number: ordersTable.number,
        table: ordersTable.tableName,
        status: ordersTable.status,
        total: ordersTable.total,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.organizationId, org),
          tenant.branchId ? eq(ordersTable.branchId, tenant.branchId) : undefined,
          ilike(ordersTable.number, pattern),
        ),
      )
      .orderBy(desc(ordersTable.createdAt))
      .limit(6);
    results.push(
      ...orders.map((o) => ({
        type: "order",
        id: o.id,
        title: o.number,
        subtitle: `${o.table ?? "No table"} · ${o.status} · KES ${o.total}`,
        href: "/orders",
      })),
    );

    const tables = await db
      .select({
        id: tablesTable.id,
        name: tablesTable.name,
        section: tablesTable.section,
        status: tablesTable.status,
        customer: tablesTable.customer,
        total: tablesTable.total,
      })
      .from(tablesTable)
      .where(
        and(
          eq(tablesTable.organizationId, org),
          tenant.branchId ? eq(tablesTable.branchId, tenant.branchId) : undefined,
          ilike(tablesTable.name, pattern),
        ),
      )
      .limit(6);
    results.push(
      ...tables.map((t) => ({
        type: "table",
        id: t.id,
        title: t.name,
        subtitle: `${t.section} · ${t.status}${t.customer ? ` · ${t.customer}` : ""}`,
        href: "/floor",
      })),
    );
  }

  if (can(req, "manage_reservations")) {
    const reservations = await db
      .select({
        id: reservationsTable.id,
        customer: reservationsTable.customer,
        phone: reservationsTable.phone,
        date: reservationsTable.reservationDate,
        time: reservationsTable.time,
        status: reservationsTable.status,
      })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.organizationId, org),
          tenant.branchId ? eq(reservationsTable.branchId, tenant.branchId) : undefined,
          or(
            ilike(reservationsTable.customer, pattern),
            ilike(reservationsTable.phone, pattern),
          ),
        ),
      )
      .limit(6);
    results.push(
      ...reservations.map((r) => ({
        type: "reservation",
        id: r.id,
        title: r.customer,
        subtitle: `${r.date} ${r.time} · ${r.status}`,
        href: "/reservations",
      })),
    );
  }

  if (can(req, "manage_events")) {
    const events = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        date: eventsTable.date,
        status: eventsTable.status,
      })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.organizationId, org),
          ilike(eventsTable.name, pattern),
        ),
      )
      .limit(6);
    results.push(
      ...events.map((e) => ({
        type: "event",
        id: e.id,
        title: e.name,
        subtitle: `${e.date} · ${e.status}`,
        href: "/events",
      })),
    );
  }

  if (can(req, "manage_vip")) {
    const customers = await db
      .select({
        id: customersTable.id,
        name: customersTable.name,
        phone: customersTable.phone,
        vipLevel: customersTable.vipLevel,
        totalSpend: customersTable.totalSpend,
      })
      .from(customersTable)
      .where(
        and(
          eq(customersTable.organizationId, org),
          or(
            ilike(customersTable.name, pattern),
            ilike(customersTable.phone, pattern),
          ),
        ),
      )
      .limit(6);
    results.push(
      ...customers.map((c) => ({
        type: "customer",
        id: c.id,
        title: c.name,
        subtitle: `${c.vipLevel} · KES ${c.totalSpend} lifetime`,
        href: "/customers",
      })),
    );
  }

  if (can(req, "manage_staff")) {
    const staff = await db
      .select({
        id: staffTable.id,
        name: staffTable.name,
        email: staffTable.email,
        role: staffTable.roleId,
      })
      .from(staffTable)
      .where(
        and(
          eq(staffTable.organizationId, org),
          or(
            ilike(staffTable.name, pattern),
            ilike(staffTable.email, pattern),
          ),
        ),
      )
      .limit(6);
    results.push(
      ...staff.map((s) => ({
        type: "staff",
        id: s.id,
        title: s.name,
        subtitle: s.email ?? s.role,
        href: "/staff",
      })),
    );
  }

  if (can(req, "view_inventory")) {
    const movements = await db
      .select({
        id: stockMovementsTable.id,
        productId: stockMovementsTable.productId,
        type: stockMovementsTable.type,
        quantity: stockMovementsTable.quantityInBaseUnit,
      })
      .from(stockMovementsTable)
      .where(eq(stockMovementsTable.organizationId, org))
      .orderBy(desc(stockMovementsTable.createdAt))
      .limit(3);
    if (movements.length) {
      const products = await db
        .select({ id: productsTable.id, name: productsTable.name })
        .from(productsTable)
        .where(inArray(productsTable.id, movements.map((m) => m.productId)));
      results.push(
        ...movements.map((m) => ({
          type: "stock",
          id: m.id,
          title: products.find((p) => p.id === m.productId)?.name ?? m.productId,
          subtitle: `${m.type} ${m.quantity}`,
          href: "/inventory",
        })),
      );
    }
  }

  res.json({ results: results.slice(0, 30) });
});

export default router;
