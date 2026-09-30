import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTabsQueryKey,
  useAddTabItem,
  useCheckoutTab,
  useCreateTab,
  useGetProductByBarcode,
  useGetProductUnits,
  useGetProducts,
  useGetTabs,
  type Product,
} from "@workspace/api-client-react";
import { Button, Field, Modal, QueryNotice, inputClass, money } from "../components/ui";

export function Pos() {
  const products = useGetProducts();
  const openTabs = useGetTabs({ status: "OPEN" });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedTabId, setSelectedTabId] = useState<string>();
  const [newTab, setNewTab] = useState<{ customer: string; table: string } | null>(null);
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
        onError: (e: Error) => setNotice({ tone: "err", text: e.message }),
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
        onError: (e: Error) => setNotice({ tone: "err", text: e.message }),
      },
    );
  }

  function submitNewTab(e: React.FormEvent) {
    e.preventDefault();
    if (!newTab?.customer || !newTab?.table) return;
    openTab.mutate(
      { data: { customer: newTab.customer, table: newTab.table, branchId: null } },
      {
        onSuccess: (created) => {
          setSelectedTabId(created.id);
          setNewTab(null);
          qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: "OPEN" }) });
        },
        onError: (err: Error) => setNotice({ tone: "err", text: err.message }),
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
        onError: (e: Error) => setNotice({ tone: "err", text: e.message }),
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
            error={products.isError}
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
              onClick={() => setNewTab({ customer: "", table: "" })}
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
            <Field label="Table or seat">
              <input
                required
                value={newTab.table}
                onChange={(e) => setNewTab({ ...newTab, table: e.target.value })}
                placeholder="e.g. T-14"
                className={inputClass}
                data-testid="input-tab-table"
              />
            </Field>
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
