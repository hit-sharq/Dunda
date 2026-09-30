import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTabsQueryKey,
  useAddTabItem,
  useCheckoutTab,
  useCreateTab,
  useGetProductByBarcode,
  useGetProductUnits,
  useGetBranchFloor,
  useGetBranches,
  useGetTicketsByTab,
  useGetProducts,
  useGetTabs,
  type Product,
} from "@workspace/api-client-react";
import { Button, Field, Modal, inputClass, money } from "../components/ui";
import { QueryNotice } from '../components/query-notice';
import { describeActionError } from '../lib/errors';

export function Pos() {
  const products = useGetProducts();
  const openTabs = useGetTabs({ status: "OPEN" });
  const branches = useGetBranches();
  const activeBranchId = branches.data?.[0]?.id ?? "";
  const floor = useGetBranchFloor(activeBranchId, {
    query: {
      enabled: Boolean(activeBranchId),
      queryKey: ["getBranchFloor", activeBranchId],
    },
  });
  // Only genuinely free tables can be picked, so a double-booking is refused
  // at the point of choice rather than after the fact.
  const freeTables = (floor.data?.sections ?? []).flatMap((section) =>
    section.tables.filter((t) => t.status === "AVAILABLE"),
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedTabId, setSelectedTabId] = useState<string>();
  const [newTab, setNewTab] = useState<{ customer: string; table: string; tableId: string | null } | null>(null);
  const [unitPicker, setUnitPicker] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("MPESA");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [barcode, setBarcode] = useState("");
  const [scanned, setScanned] = useState<string | null>(null);
  const qc = useQueryClient();
  const addItem = useAddTabItem();
  const openTab = useCreateTab();
  const checkout = useCheckoutTab();
  const barcodeLookup = useGetProductByBarcode(scanned ?? "", {
    query: { enabled: Boolean(scanned), queryKey: ["getProductByBarcode", scanned] },
  });
  const unitList = useGetProductUnits(unitPicker?.id ?? "", {
    query: { enabled: Boolean(unitPicker), queryKey: ["getProductUnits", unitPicker?.id] },
  });

  const list = products.data ?? [];
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(list.map((p) => p.category)))],
    [list],
  );
  const filtered = useMemo(
    () =>
      list.filter(
        (p) =>
          (category === "All" || p.category === category) &&
          p.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [list, category, search],
  );
  const tab = openTabs.data?.find((t) => t.id === selectedTabId);
  const units = unitList.data ?? [];

  useEffect(() => {
    if (selectedTabId && !tab) setSelectedTabId(undefined);
  }, [selectedTabId, tab]);

  useEffect(() => {
    setQuantity(1);
    setNote("");
  }, [unitPicker?.id]);

  // Barcode scanners behave like a keyboard: digits arrive fast and end in Enter.
  const bufferRef = useRef("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) &&
        target.getAttribute("data-scanner-exempt") !== "true";
      if (typing) return;
      if (e.key === "Enter") {
        if (bufferRef.current.length >= 6) {
          e.preventDefault();
          void resolveBarcode(bufferRef.current);
        }
        bufferRef.current = "";
        return;
      }
      if (e.key.length === 1) bufferRef.current += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTabId]);

  // A completed barcode lookup adds the product straight to the open tab.
  useEffect(() => {
    const found = barcodeLookup.data;
    if (!found || !scanned || !selectedTabId) return;
    addItem.mutate(
      {
        tabId: selectedTabId,
        data: {
          productId: found.productId,
          quantity: 1,
          unitId: found.sellingUnit?.id ?? null,
          notes: null,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: "OPEN" }) });
          setNotice({ tone: "ok", text: `${found.name} added` });
        },
        onError: (e: unknown) => setNotice({ tone: "err", text: describeActionError(e) }),
      },
    );
    setScanned(null);
  }, [barcodeLookup.data, scanned, selectedTabId, addItem, qc]);

  useEffect(() => {
    if (scanned && barcodeLookup.isError) {
      setNotice({ tone: "err", text: `Product not found (${scanned})` });
      setScanned(null);
    }
  }, [scanned, barcodeLookup.isError]);

  function resolveBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (!selectedTabId) {
      setNotice({ tone: "err", text: "Open a tab before scanning." });
      return;
    }
    setScanned(trimmed);
  }

  function openUnitPicker(product: Product) {
    if (!selectedTabId) {
      setNotice({ tone: "err", text: "Open a tab first, then add items." });
      return;
    }
    setUnitPicker(product);
  }

  function commitAdd(unitId: string | null, price: number) {
    if (!selectedTabId || !unitPicker) return;
    addItem.mutate(
      {
        tabId: selectedTabId,
        data: { productId: unitPicker.id, quantity, unitId, notes: note.trim() || null },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: "OPEN" }) });
          setNotice({
            tone: "ok",
            text: `${quantity} × ${unitPicker.name} · ${money(price * quantity)}`,
          });
          setUnitPicker(null);
        },
        onError: (e: unknown) => setNotice({ tone: "err", text: describeActionError(e) }),
      },
    );
  }

  function submitNewTab(e: React.FormEvent) {
    e.preventDefault();
    if (!newTab?.customer || !newTab?.table) return;
    openTab.mutate(
      { data: { customer: newTab.customer, table: newTab.table, tableId: newTab.tableId, branchId: null } },
      {
        onSuccess: (created) => {
          setSelectedTabId(created.id);
          setNewTab(null);
          qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: "OPEN" }) });
        },
        onError: (err: unknown) => setNotice({ tone: "err", text: describeActionError(err) }),
      },
    );
  }

  function pay() {
    if (!tab) return;
    checkout.mutate(
      { tabId: tab.id, data: { method: method as never, amount: tab.total, reference: null } },
      {
        onSuccess: (result) => {
          setNotice({
            tone: "ok",
            text: `Receipt ${result.receiptNumber} · ${money(tab.total)} closed`,
          });
          setSelectedTabId(undefined);
          qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: "OPEN" }) });
        },
        onError: (e: unknown) => setNotice({ tone: "err", text: describeActionError(e) }),
      },
    );
  }

  return (
    <div className="rise">
      {notice && (
        <div
          className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "ok"
              ? "border-[#b8d5c9] bg-[#e5f1eb] text-[#397463]"
              : "border-[#e6bdb2] bg-[#fbeae5] text-[#a3452e]"
          }`}
          data-testid="status-pos-notice"
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <section className="min-w-0">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                  category === c
                    ? "bg-[#27383e] text-[#f8f1e5]"
                    : "bg-[#e9e4d9] text-[#66726d] hover:bg-[#ded8cb]"
                }`}
                data-testid={`button-category-${c.toLowerCase()}`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="flex h-11 items-center gap-2 rounded-xl border border-[#ded8cd] bg-[#fbf9f3] px-3 text-[#8c958f]">
              <span aria-hidden>⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-[#182127] outline-none placeholder:text-[#9ca39d]"
                placeholder="Search drinks, dishes, cover..."
                data-testid="input-search-products"
              />
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                resolveBarcode(barcode);
                setBarcode("");
              }}
              className="flex h-11 items-center gap-2 rounded-xl border border-[#ded8cd] bg-[#fbf9f3] px-3"
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#98a09a]">
                Scan
              </span>
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-28 bg-transparent font-mono text-sm outline-none"
                placeholder="Barcode"
                data-scanner-exempt="true"
                data-testid="input-barcode"
              />
            </form>
          </div>

          <QueryNotice
            loading={products.isLoading}
            error={products.error}
            empty={!products.isLoading && !products.isError && !filtered.length}
            onRetry={() => products.refetch()}
            emptyTitle="No products match"
            emptyHint="Adjust the search or category, or add the product first."
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => openUnitPicker(p)}
                disabled={!p.available || addItem.isPending}
                className="surface group min-h-[150px] rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-45"
                data-testid={`button-product-${p.id}`}
              >
                <div className="mb-6 flex items-start justify-between">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-xl text-sm font-bold"
                    style={{ background: `${p.accent}25`, color: p.accent }}
                  >
                    {p.category.slice(0, 1)}
                  </span>
                  <span className="font-mono text-[10px] text-[#8a948d]">{p.unit}</span>
                </div>
                <span className="block text-sm font-semibold leading-tight">{p.name}</span>
                <span className="mt-1 block font-mono text-sm font-medium text-[#b65332]">
                  {money(p.price)}
                </span>
                {p.stock > 0 && (
                  <span className="mt-1 block font-mono text-[10px] text-[#8d968f]">
                    {p.stock} in stock
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <aside className="surface h-fit rounded-2xl p-4 md:sticky md:top-[88px]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Current tab</h3>
            <Button
              onClick={() => setNewTab({ customer: "", table: "", tableId: null })}
              data-testid="button-new-tab"
            >
              + New
            </Button>
          </div>

          {!tab ? (
            <div className="rounded-xl bg-[#f5f1e8] p-4 text-sm text-[#69736f]">
              <p className="font-semibold text-[#273239]">No tab selected</p>
              <p className="mt-1 text-xs">
                Open a tab for a table, or pick an open tab to add items.
              </p>
              {openTabs.data && openTabs.data.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {openTabs.data.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTabId(t.id)}
                      className="flex items-center justify-between rounded-lg border border-[#e2dbcd] bg-[#fffefb] px-3 py-2 text-left text-xs hover:border-[#f07a4b]"
                    >
                      <span className="font-semibold">
                        {t.table} · {t.customer}
                      </span>
                      <span className="font-mono">{money(t.total)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div data-testid="panel-open-tab">
              <div className="mb-3 rounded-xl bg-[#f5f1e8] p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#8b938c]">
                  {tab.number}
                </p>
                <p className="font-display text-lg font-bold">
                  {tab.table} · {tab.customer}
                </p>
              </div>

              <ul className="grid gap-2">
                {tab.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-2 border-b border-[#eee8de] pb-2 text-sm last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">{item.name}</span>
                      <span className="block font-mono text-[10px] text-[#859089]">
                        {item.quantity}
                        {item.unitName ? ` × ${item.unitName}` : ""} @ {money(item.unitPrice)}
                      </span>
                    </span>
                    <span className="font-mono">{money(item.total)}</span>
                  </li>
                ))}
                {tab.items.length === 0 && (
                  <li className="py-4 text-center text-xs text-[#859089]">
                    Tap a product to start the order.
                  </li>
                )}
              </ul>

              <OutstandingTickets tabId={tab.id} />

              <dl className="mt-4 grid gap-1.5 border-t border-[#e8e1d6] pt-3 text-sm">
                <div className="flex justify-between text-[#748079]">
                  <dt>Subtotal</dt>
                  <dd className="font-mono">{money(tab.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-[#748079]">
                  <dt>Service charge</dt>
                  <dd className="font-mono">{money(tab.serviceCharge)}</dd>
                </div>
                <div className="flex justify-between text-[#748079]">
                  <dt>Tax</dt>
                  <dd className="font-mono">{money(tab.tax)}</dd>
                </div>
                <div className="mt-1 flex justify-between border-t border-[#e8e1d6] pt-2 text-base font-bold">
                  <dt>Total</dt>
                  <dd className="font-mono" data-testid="tab-total">
                    {money(tab.total)}
                  </dd>
                </div>
              </dl>

              <Field label="Payment method">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className={inputClass}
                  data-testid="select-payment-method"
                >
                  <option value="MPESA">M-Pesa</option>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                </select>
              </Field>

              <Button
                className="mt-3 w-full"
                disabled={checkout.isPending || tab.total <= 0}
                onClick={pay}
                data-testid="button-checkout"
              >
                {checkout.isPending ? "Closing…" : `Take payment · ${money(tab.total)}`}
              </Button>
              <Button
                variant="ghost"
                className="mt-1 w-full"
                onClick={() => setSelectedTabId(undefined)}
              >
                Close panel
              </Button>
            </div>
          )}
        </aside>
      </div>

      {newTab && (
        <Modal title="Open a new tab" onClose={() => setNewTab(null)}>
          <form onSubmit={submitNewTab} className="grid gap-4">
            <Field label="Customer name">
              <input
                required
                value={newTab.customer}
                onChange={(e) => setNewTab({ ...newTab, customer: e.target.value })}
                placeholder="e.g. Nia"
                className={inputClass}
                data-testid="input-tab-customer"
              />
            </Field>
            <Field label="Table">
              <select
                required
                value={newTab.tableId ?? ""}
                onChange={(e) => {
                  const chosen = freeTables.find((t) => t.id === e.target.value);
                  setNewTab({
                    ...newTab,
                    tableId: chosen?.id ?? null,
                    table: chosen?.name ?? newTab.table,
                  });
                }}
                className={inputClass}
                data-testid="select-tab-table"
              >
                <option value="" disabled>Select a free table</option>
                {freeTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.section} ({t.seats} seats)
                  </option>
                ))}
              </select>
            </Field>
            {freeTables.length === 0 && (
              <p className="-mt-2 text-xs text-[#a3452e]">
                Every table is currently occupied. Close a tab to free one.
              </p>
            )}
            <Button
              className="mt-2 w-full"
              disabled={openTab.isPending}
              data-testid="button-create-tab"
            >
              {openTab.isPending ? "Opening…" : "Open tab"}
            </Button>
          </form>
        </Modal>
      )}

      {unitPicker && (
        <Modal
          title={unitPicker.name.toUpperCase()}
          onClose={() => setUnitPicker(null)}
        >
          <div className="grid gap-4">
            <p className="text-xs text-[#69736f]">
              Inventory is tracked in <strong>{unitPicker.unit}</strong>. Selling a
              portion deducts exactly that much.
            </p>

            <Field label="Quantity">
              <input
                type="number"
                min={0.5}
                step={units.some((u) => u.wholeUnitsOnly) ? 1 : 0.5}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className={inputClass}
                data-testid="input-quantity"
              />
            </Field>

            <Field label="Note for the bar or kitchen">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. no ice, extra lime"
                className={inputClass}
                data-testid="input-item-note"
              />
            </Field>

            <div className="grid gap-2">
              {(units.length ? units : []).map((u) => (
                <button
                  key={u.id}
                  onClick={() => commitAdd(u.id, u.sellingPrice)}
                  className="flex items-center justify-between rounded-xl border border-[#e2dbcd] bg-[#fffefb] px-4 py-3 text-left hover:border-[#f07a4b]"
                  data-testid={`button-unit-${u.id}`}
                >
                  <span>
                    <span className="block text-sm font-bold uppercase tracking-wider">
                      {u.name}
                    </span>
                    <span className="block font-mono text-[10px] text-[#859089]">
                      {u.conversionFactor} {unitPicker.unit} per unit
                    </span>
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {money(u.sellingPrice * quantity)}
                  </span>
                </button>
              ))}
              {unitList.isLoading && (
                <div className="rounded-xl bg-[#f5f1e8] p-4 text-center text-xs text-[#859089]">
                  Loading selling units…
                </div>
              )}
              {unitList.isError && (
                <div className="rounded-xl bg-[#fbeae5] p-4 text-center text-xs text-[#a3452e]">
                  Couldn’t load selling units.
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * What the stations still owe this table.
 *
 * A waiter who rings in a round sees immediately that the drinks are ready but
 * the food is still preparing, rather than having to ask.
 */
function OutstandingTickets({ tabId }: { tabId: string }) {
  const tickets = useGetTicketsByTab(tabId, {
    query: { queryKey: ["getTicketsByTab", tabId] },
  });

  if (tickets.isLoading) return null;

  const open = (tickets.data ?? []).filter((t) => t.status !== "SERVED" && t.status !== "CANCELLED");
  if (!open.length) return null;

  return (
    <div className="mt-3 rounded-xl bg-[#f5f1e8] p-3" data-testid="panel-outstanding">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8b938c]">
        Still with the stations
      </p>
      <div className="grid gap-1.5">
        {open.map((ticket) => (
          <div key={ticket.id} className="flex items-start justify-between gap-2 text-xs">
            <span className="min-w-0">
              <span className="font-semibold">
                {ticket.station === "BAR" ? "Bar" : "Kitchen"}
              </span>
              <span className="ml-1 text-[#859089]">{ticket.status.toLowerCase()}</span>
              <span className="block text-[#65716b]">
                {ticket.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
