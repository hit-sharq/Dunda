import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetProductsQueryKey,
  useCreateProduct,
  useCreateProductUnit,
  useGetCategories,
  useGetProducts,
  useGetProductUnits,
  useUpdateProductUnit,
  type Product,
  type ProductUnitInput,
} from "@workspace/api-client-react";
import {
  Button,
  Field,
  Modal,
  PageIntro,
  inputClass,
  money,
} from "../components/ui";
import { useMoney } from "../lib/money";
import { QueryNotice } from '../components/query-notice';

export function Products() {
  const products = useGetProducts();
  const categories = useGetCategories();
  const createProduct = useCreateProduct();
  const createUnit = useCreateProductUnit();
  const updateUnit = useUpdateProductUnit();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [newProduct, setNewProduct] = useState<null | Record<string, string>>(null);
  const [unitFor, setUnitFor] = useState<Product | null>(null);

  const list = products.data ?? [];
  const filtered = useMemo(
    () =>
      list.filter(
        (p) =>
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.sku ?? "").toLowerCase().includes(search.toLowerCase()),
      ),
    [list, search],
  );

  return (
    <div className="rise">
      <PageIntro
        eyebrow="Catalog / units / barcodes"
        title="What you can sell"
        detail="Every product has a base inventory unit and one or more selling units. A shot of whisky deducts 30ml; a bottle deducts 750ml."
        action={
          <Button onClick={() => setNewProduct({})} data-testid="button-new-product">
            + New product
          </Button>
        }
      />

      <label className="mb-4 flex h-11 max-w-md items-center gap-2 rounded-xl border border-[#ded8cd] bg-[#fbf9f3] px-3 text-[#8c958f]">
        <span aria-hidden>⌕</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm outline-none"
          placeholder="Search by name or SKU"
          data-testid="input-search-catalog"
        />
      </label>

      <section className="surface overflow-hidden rounded-2xl">
        <QueryNotice
          loading={products.isLoading}
          error={products.error}
          empty={!products.isLoading && !products.isError && !filtered.length}
          onRetry={() => products.refetch()}
          emptyTitle="No products yet"
          emptyHint="Add your first product to start selling."
          emptyAction={
            <Button variant="outline" onClick={() => setNewProduct({})}>
              Add product
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[#e8e1d6] text-left text-xs uppercase tracking-wider text-[#8b938c]">
                <th className="px-5 py-3 font-semibold">Product</th>
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Base unit</th>
                <th className="px-5 py-3 font-semibold">SKU</th>
                <th className="px-5 py-3 font-semibold">Barcode</th>
                <th className="px-5 py-3 text-right font-semibold">Price</th>
                <th className="px-5 py-3 text-right font-semibold">Stock</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[#f0ebe1] last:border-0"
                  data-testid={`row-product-${p.id}`}
                >
                  <td className="px-5 py-3">
                    <span className="font-semibold">{p.name}</span>
                    {!p.active && (
                      <span className="ml-2 rounded-full bg-[#ece8de] px-2 py-0.5 text-[10px] text-[#7c8780]">
                        inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[#65716b]">{p.category}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[#65716b]">{p.baseUnit}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[#859089]">{p.sku ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[#859089]">
                    {p.barcode ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{money(p.price)}</td>
                  <td className="px-5 py-3 text-right font-mono text-[#65716b]">
                    {p.trackInventory ? p.stock : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="outline"
                      onClick={() => setUnitFor(p)}
                      data-testid={`button-units-${p.id}`}
                    >
                      Units
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {newProduct && (
        <ProductForm
          value={newProduct}
          categories={categories.data ?? []}
          onChange={setNewProduct}
          busy={createProduct.isPending}
          onClose={() => setNewProduct(null)}
          onSubmit={() => {
            createProduct.mutate(
              {
                data: {
                  name: newProduct.name ?? "",
                  categoryId: newProduct.categoryId ?? "",
                  category:
                    categories.data?.find((c) => c.id === newProduct.categoryId)?.name ??
                    newProduct.category ??
                    "Other",
                  baseUnit: newProduct.baseUnit?.trim() || "piece",
                  sku: newProduct.sku || null,
                  barcode: newProduct.barcode || null,
                  description: newProduct.description || null,
                  cost: Number(newProduct.cost ?? 0),
                  price: Number(newProduct.price ?? 0),
                  tax: 16,
                  trackInventory: true,
                  accent: newProduct.accent || "amber",
                },
              },
              {
                onSuccess: () => {
                  qc.invalidateQueries({ queryKey: getGetProductsQueryKey() });
                  setNewProduct(null);
                },
              },
            );
          }}
        />
      )}

      {unitFor && (
        <UnitManager
          product={unitFor}
          onClose={() => setUnitFor(null)}
          onCreate={(values) =>
            createUnit.mutate(
              { productId: unitFor.id, data: values },
              {
                onSuccess: () => {
                  qc.invalidateQueries({
                    queryKey: getGetProductUnitsQueryKey(unitFor.id),
                  });
                  qc.invalidateQueries({ queryKey: getGetProductsQueryKey() });
                },
              },
            )
          }
          onUpdate={(unitId, values) =>
            updateUnit.mutate(
              { productId: unitFor.id, unitId, data: values },
              {
                onSuccess: () => {
                  qc.invalidateQueries({
                    queryKey: getGetProductUnitsQueryKey(unitFor.id),
                  });
                  qc.invalidateQueries({ queryKey: getGetProductsQueryKey() });
                },
              },
            )
          }
          busy={createUnit.isPending || updateUnit.isPending}
        />
      )}
    </div>
  );
}

function getGetProductUnitsQueryKey(productId: string) {
  return ["getProductUnits", { productId }] as const;
}

function ProductForm({
  value,
  categories,
  onChange,
  onSubmit,
  onClose,
  busy,
}: {
  value: Record<string, string>;
  categories: { id: string; name: string }[];
  onChange: (v: Record<string, string>) => void;
  onSubmit: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const { currency } = useMoney();
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <Modal title="New product" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="grid gap-4"
      >
        <Field label="Name">
          <input
            required
            value={value.name ?? ""}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
            data-testid="input-product-name"
          />
        </Field>
        <Field label="Category">
          <select
            required
            value={value.categoryId ?? ""}
            onChange={(e) => set("categoryId", e.target.value)}
            className={inputClass}
            data-testid="select-product-category"
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Base inventory unit">
          <input
            required
            value={value.baseUnit ?? "piece"}
            onChange={(e) => set("baseUnit", e.target.value)}
            placeholder="piece, bottle, ml, plate"
            className={inputClass}
            data-testid="input-product-baseunit"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Cost (${currency})`}>
            <input
              type="number"
              min={0}
              value={value.cost ?? "0"}
              onChange={(e) => set("cost", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={`Selling price (${currency})`}>
            <input
              required
              type="number"
              min={0}
              value={value.price ?? ""}
              onChange={(e) => set("price", e.target.value)}
              className={inputClass}
              data-testid="input-product-price"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU">
            <input
              value={value.sku ?? ""}
              onChange={(e) => set("sku", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Barcode">
            <input
              value={value.barcode ?? ""}
              onChange={(e) => set("barcode", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Button className="mt-2 w-full" disabled={busy} data-testid="button-save-product">
          {busy ? "Saving…" : "Create product"}
        </Button>
      </form>
    </Modal>
  );
}

function UnitManager({
  product,
  onClose,
  onCreate,
  onUpdate,
  busy,
}: {
  product: Product;
  onClose: () => void;
  onCreate: (v: ProductUnitInput) => void;
  onUpdate: (unitId: string, v: ProductUnitInput) => void;
  busy: boolean;
}) {
  const { currency } = useMoney();
  const units = useGetProductUnits(product.id);
  const [draft, setDraft] = useState({
    name: "",
    abbreviation: "",
    conversionFactor: "1",
    sellingPrice: "0",
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  return (
    <Modal
      wide
      title={`Selling units · ${product.name}`}
      onClose={onClose}
    >
      <div className="grid gap-5">
        <p className="text-xs text-[#69736f]">
          Base unit: <strong>{product.baseUnit}</strong>. A conversion factor states
          how many base units one selling unit consumes.
        </p>

        <QueryNotice
          loading={units.isLoading}
          error={units.error}
          empty={!units.isLoading && !units.isError && !units.data?.length}
          onRetry={() => units.refetch()}
          emptyTitle="No selling units"
          emptyHint="Add a unit so the POS knows how much stock to deduct."
        />

        <div className="grid gap-2">
          {units.data?.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[#e2dbcd] bg-[#fffefb] px-4 py-3"
            >
              <div>
                <p className="text-sm font-bold uppercase tracking-wider">
                  {u.name}{" "}
                  {u.isBaseUnit && (
                    <span className="ml-1 rounded-full bg-[#e2f0e8] px-2 py-0.5 text-[10px] font-semibold text-[#3c7e69]">
                      base
                    </span>
                  )}
                </p>
                <p className="font-mono text-[10px] text-[#859089]">
                  {u.conversionFactor} {product.baseUnit} per {u.name.toLowerCase()}
                </p>
              </div>
              {editing === u.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-28 rounded-lg border border-[#ded8cd] px-2 py-1 text-sm"
                    data-testid={`input-unit-price-${u.id}`}
                  />
                  <Button
                    disabled={busy}
                    onClick={() => {
                      onUpdate(u.id, {
                        name: u.name,
                        abbreviation: u.abbreviation,
                        conversionFactor: u.conversionFactor,
                        sellingPrice: Number(editPrice),
                        isBaseUnit: u.isBaseUnit,
                        wholeUnitsOnly: u.wholeUnitsOnly,
                        sortOrder: u.sortOrder,
                      });
                      setEditing(null);
                    }}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">
                    {money(u.sellingPrice)}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(u.id);
                      setEditPrice(String(u.sellingPrice));
                    }}
                    data-testid={`button-edit-price-${u.id}`}
                  >
                    Edit
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({
              name: draft.name,
              abbreviation: draft.abbreviation || draft.name.slice(0, 4).toUpperCase(),
              conversionFactor: Number(draft.conversionFactor),
              isBaseUnit: false,
              sellingPrice: Number(draft.sellingPrice),
              wholeUnitsOnly: true,
              sortOrder: (units.data?.length ?? 0) + 1,
            });
            setDraft({ name: "", abbreviation: "", conversionFactor: "1", sellingPrice: "0" });
          }}
          className="grid gap-3 border-t border-[#e8e1d6] pt-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[#8b938c]">
            Add a selling unit
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Name">
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Shot"
                className={inputClass}
                data-testid="input-unit-name"
              />
            </Field>
            <Field label="Abbrev.">
              <input
                value={draft.abbreviation}
                onChange={(e) => setDraft({ ...draft, abbreviation: e.target.value })}
                placeholder="SHOT"
                className={inputClass}
              />
            </Field>
            <Field label={`Per 1 ${product.baseUnit}`}>
              <input
                required
                type="number"
                step="any"
                min="0.0001"
                value={draft.conversionFactor}
                onChange={(e) => setDraft({ ...draft, conversionFactor: e.target.value })}
                className={inputClass}
                data-testid="input-unit-factor"
              />
            </Field>
            <Field label={`Price (${currency})`}>
              <input
                required
                type="number"
                min={0}
                value={draft.sellingPrice}
                onChange={(e) => setDraft({ ...draft, sellingPrice: e.target.value })}
                className={inputClass}
                data-testid="input-unit-price"
              />
            </Field>
          </div>
          <Button disabled={busy} data-testid="button-add-unit">
            Add unit
          </Button>
        </form>
      </div>
    </Modal>
  );
}
