import { prisma } from "@/lib/db/client";
import { notFound as nextNotFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClubMenuPage({
  params,
}: {
  params: { slug: string };
}) {
  const org = await prisma.dunda_organizations.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      currency: true,
      status: true,
      dunda_branches: {
        where: { status: { in: ["LIVE", "ACTIVE"] } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, city: true, address: true, phone: true },
      },
    },
  });

  if (!org) return nextNotFound();

  if (org.status !== "ACTIVE") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[hsl(var(--app-bg))] p-6 text-center">
        <h1 className="text-xl font-bold text-[hsl(var(--app-ink))]">
          This club is not currently serving
        </h1>
        <p className="text-sm text-[hsl(var(--app-faint))]">Please check back shortly.</p>
      </main>
    );
  }

  const products = await prisma.dunda_products.findMany({
    where: { organization_id: org.id, active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      image: true,
      description: true,
      dunda_product_units: {
        select: { id: true, name: true, selling_price: true, is_base_unit: true },
        orderBy: { is_base_unit: "desc" },
      },
    },
  });

  const categories = [...new Set(products.map((p) => p.category))];
  const currency = org.currency;

  const productJson = JSON.stringify(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      image: p.image,
      description: p.description,
      units: p.dunda_product_units.map((u) => ({
        id: u.id,
        name: u.name,
        price: u.selling_price,
        isBase: u.is_base_unit,
      })),
    })),
  );

  const branchJson = JSON.stringify(org.dunda_branches);

  return (
    <main className="min-h-dvh bg-[hsl(var(--app-bg))] pb-32">
      <header className="sticky top-0 z-20 border-b border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))]/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-mono uppercase tracking-[.2em] text-[hsl(var(--app-faint))]">
              {org.name}
            </p>
            <h1 className="truncate text-lg font-bold text-[hsl(var(--app-ink))]">
              Our menu
            </h1>
          </div>
          <a
            href={`/order/${org.dunda_branches[0]?.id ?? ""}`}
            className="shrink-0 rounded-lg bg-[hsl(var(--app-gold))] px-3 py-1.5 text-xs font-bold text-[hsl(var(--app-ink))]"
            id="quick-order"
          >
            Order now
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-5" id="location-picker">
          <p className="mb-2 text-[10px] font-mono uppercase tracking-[.2em] text-[hsl(var(--app-faint))]">
            Choose where you are
          </p>
          <div className="flex flex-wrap gap-2" id="branches"></div>
        </div>

        <div className="mb-5 hidden" id="table-picker">
          <p className="mb-2 text-[10px] font-mono uppercase tracking-[.2em] text-[hsl(var(--app-faint))]">
            Choose your table
          </p>
          <div className="grid grid-cols-4 gap-2" id="tables"></div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2" id="categories">
          <button
            data-category=""
            className="rounded-full border border-[hsl(var(--app-gold))] bg-[hsl(var(--app-gold))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--app-ink))]"
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              data-category={cat}
              className="rounded-full border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--app-faint))]"
            >
              {cat}
            </button>
          ))}
        </div>

        <div id="menu" className="grid grid-cols-1 gap-3 sm:grid-cols-2"></div>
      </div>

      <div
        id="cart-bar"
        className="fixed inset-x-0 bottom-0 z-30 hidden border-t border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-[hsl(var(--app-faint))]" id="cart-count">
              0 items
            </p>
            <p className="text-lg font-bold text-[hsl(var(--app-ink))]" id="cart-total">
              {new Intl.NumberFormat("en-KE", {
                style: "currency",
                currency,
                maximumFractionDigits: 0,
              }).format(0)}
            </p>
          </div>
          <button
            id="place-order"
            className="rounded-xl bg-[hsl(var(--app-gold))] px-5 py-3 text-sm font-bold text-[hsl(var(--app-ink))] disabled:opacity-50"
            disabled
          >
            Send to kitchen
          </button>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            const PRODUCTS = ${productJson};
            const BRANCHES = ${branchJson};
            const CURRENCY = ${JSON.stringify(currency)};
            let cart = [];
            let branchId = BRANCHES.length ? BRANCHES[0].id : null;
            let tableId = null;

            const money = (n) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(n);
            const el = (id) => document.getElementById(id);

            function renderBranches() {
              el('branches').innerHTML = BRANCHES.map(function(b) {
                const on = b.id === branchId;
                return '<button data-branch="' + b.id + '" class="rounded-lg border px-3 py-1.5 text-xs font-semibold ' + (on
                  ? 'border-[hsl(var(--app-gold))] bg-[hsl(var(--app-gold))] text-[hsl(var(--app-ink))]'
                  : 'border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-faint))]') + '">' + b.name + '</button>';
              }).join('');
            }

            async function loadTables() {
              if (!branchId) return;
              const res = await fetch('/api/public/branch/' + branchId + '/tables');
              if (!res.ok) return;
              const tables = await res.json();
              el('table-picker').classList.remove('hidden');
              el('tables').innerHTML = tables.map(function(t) {
                return '<button data-table="' + t.id + '" data-name="' + t.name + '" class="aspect-square rounded-xl border px-2 text-xs font-semibold ' + (t.occupied
                  ? 'border-[hsl(var(--app-line))] bg-[hsl(var(--app-warn-soft))] text-[hsl(var(--app-warn))]'
                  : 'border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-ink))]') + '">' + t.name + '</button>';
              }).join('');
            }

            function renderMenu(filter) {
              const menu = el('menu');
              const list = PRODUCTS.filter(function(p) { return !filter || p.category === filter; });
              menu.innerHTML = list.map(function(p) {
                return '<div class="flex gap-3 rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-3">' +
                  '<div class="min-w-0 flex-1">' +
                    '<h3 class="truncate text-sm font-semibold text-[hsl(var(--app-ink))]">' + p.name + '</h3>' +
                    '<p class="mt-0.5 text-xs text-[hsl(var(--app-faint))]">' + p.category + (p.description ? ' • ' + p.description : '') + '</p>' +
                    '<p class="mt-1 text-sm font-bold text-[hsl(var(--app-gold))]">' + money(p.price) + '</p>' +
                  '</div>' +
                  '<button data-add="' + p.id + '" class="h-10 w-10 shrink-0 rounded-xl bg-[hsl(var(--app-gold))] text-lg font-bold text-[hsl(var(--app-ink))]">+</button>' +
                '</div>';
              }).join('');
            }

            function renderCart() {
              const bar = el('cart-bar');
              if (cart.length === 0) { bar.classList.add('hidden'); return; }
              bar.classList.remove('hidden');
              const count = cart.reduce(function(s, i) { return s + i.quantity; }, 0);
              const total = cart.reduce(function(s, i) { return s + i.price * i.quantity; }, 0);
              el('cart-count').textContent = count + (count === 1 ? ' item' : ' items');
              el('cart-total').textContent = money(total);
              el('place-order').disabled = !tableId;
              el('place-order').textContent = tableId ? 'Send to kitchen' : 'Pick a table first';
            }

            el('menu').addEventListener('click', function(e) {
              const btn = e.target.closest('[data-add]');
              if (!btn) return;
              const p = PRODUCTS.find(function(x) { return x.id === btn.getAttribute('data-add'); });
              if (!p) return;
              const base = p.units.find(function(u) { return u.isBase; }) || p.units[0];
              cart.push({ productId: p.id, quantity: 1, unitId: base ? base.id : null, price: base ? base.price : p.price, name: p.name });
              renderCart();
            });

            el('branches').addEventListener('click', function(e) {
              const btn = e.target.closest('[data-branch]');
              if (!btn) return;
              branchId = btn.getAttribute('data-branch');
              tableId = null;
              renderBranches();
              loadTables();
              renderCart();
            });

            el('tables').addEventListener('click', function(e) {
              const btn = e.target.closest('[data-table]');
              if (!btn) return;
              tableId = btn.getAttribute('data-table');
              document.querySelectorAll('#tables button').forEach(function(b) {
                const on = b.getAttribute('data-table') === tableId;
                b.className = 'aspect-square rounded-xl border px-2 text-xs font-semibold ' + (on
                  ? 'border-[hsl(var(--app-gold))] bg-[hsl(var(--app-gold))] text-[hsl(var(--app-ink))]'
                  : 'border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-ink))]');
              });
              renderCart();
            });

            el('categories').addEventListener('click', function(e) {
              const btn = e.target.closest('[data-category]');
              if (!btn) return;
              const cat = btn.getAttribute('data-category');
              document.querySelectorAll('#categories button').forEach(function(b) {
                const on = b.getAttribute('data-category') === cat;
                b.className = 'rounded-full border px-3 py-1.5 text-xs font-semibold ' + (on
                  ? 'border-[hsl(var(--app-gold))] bg-[hsl(var(--app-gold))] text-[hsl(var(--app-ink))]'
                  : 'border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-faint))]');
              });
              renderMenu(cat);
            });

            el('place-order').addEventListener('click', async function() {
              if (!tableId) return;
              const btn = el('place-order');
              btn.disabled = true;
              btn.textContent = 'Sending...';
              try {
                const res = await fetch('/api/public/table/' + tableId + '/order', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    items: cart.map(function(i) {
                      return { productId: i.productId, quantity: i.quantity, unitId: i.unitId };
                    })
                  })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Could not place the order');
                el('menu').innerHTML = '<div class="rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-6 text-center">' +
                  '<p class="text-lg font-bold text-[hsl(var(--app-ink))]">Order ' + data.number + ' sent</p>' +
                  '<p class="mt-1 text-sm text-[hsl(var(--app-faint))]">Your server has it. They will bring it right over.</p>' +
                  '<a class="mt-3 inline-block rounded-lg border border-[hsl(var(--app-line))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--app-ink))]" href="/order-status/' + data.id + '">Track this order</a>' +
                  '</div>';
                el('cart-bar').classList.add('hidden');
                el('table-picker').classList.add('hidden');
                cart = [];
              } catch (err) {
                alert(err.message);
                btn.disabled = false;
                btn.textContent = 'Send to kitchen';
              }
            });

            renderBranches();
            loadTables();
            renderMenu('');
            renderCart();
          `,
        }}
      />
    </main>
  );
}
