import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCategoriesQueryKey,
  getGetProductsQueryKey,
  useCreateCategory,
  useCreateProduct,
  useCreateProductUnit,
  useDeleteCategory,
  useDeleteProduct,
  useGetCategories,
  useGetProducts,
  useGetProductUnits,
  useUpdateCategory,
  useUpdateProduct,
  useUpdateProductUnit,
  type Category,
  type Product,
  type ProductInput,
  type ProductUnitInput,
} from "@/lib/api-client-react/src";
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
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const [newCategory, setNewCategory] = useState<null | Record<string, string>>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

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

      <label className="mb-4 flex h-11 max-w-md items-center gap-2 rounded-xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] px-3 text-[hsl(var(--app-muted))]">
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
              <tr className="border-b border-[hsl(var(--app-line-soft))] text-left text-xs uppercase tracking-wider text-[hsl(var(--app-faint))]">
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
                  className="border-b border-[hsl(var(--app-raised))] last:border-0"
                  data-testid={`row-product-${p.id}`}
                >
                  <td className="px-5 py-3">
                    <span className="font-semibold">{p.name}</span>
                    {!p.active && (
                      <span className="ml-2 rounded-full bg-[hsl(var(--app-line))] px-2 py-0.5 text-[10px] text-[hsl(var(--app-muted))]">
                        inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[hsl(var(--app-ink-soft))]">{p.category}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[hsl(var(--app-ink-soft))]">{p.baseUnit}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[hsl(var(--app-muted))]">{p.sku ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[hsl(var(--app-muted))]">
                    {p.barcode ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{money(p.price)}</td>
                  <td className="px-5 py-3 text-right font-mono text-[hsl(var(--app-ink-soft))]">
                    {p.trackInventory ? p.stock : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingProduct(p)}
                        data-testid={`button-edit-product-${p.id}`}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeletingProductId(p.id)}
                        data-testid={`button-delete-product-${p.id}`}
                      >
                        Delete
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUnitFor(p)}
                        data-testid={`button-units-${p.id}`}
                      >
                        Units
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface overflow-hidden rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl font-bold">Menu categories</h3>
          <Button onClick={() => setNewCategory({ name: "", color: "#6f9fb2", group: "", station: "", sortOrder: "0" })} data-testid="button-new-category">
            + New category
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--app-line-soft))] text-left text-xs uppercase tracking-wider text-[hsl(var(--app-faint))]">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Color</th>
                <th className="px-5 py-3 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {categories.data?.map((c) => (
                <tr key={c.id} className="border-b border-[hsl(var(--app-raised))] last:border-0" data-testid={`row-category-${c.id}`}>
                  <td className="px-5 py-3">
                    <span className="font-semibold">{c.name}</span>
                  </td>
                  <td className="px-5 py-3">{c.color}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => {
                        setNewCategory({
                          name: c.name,
                          color: c.color ?? "",
                          group: c.group ?? "",
                          station: c.station ?? "",
                          sortOrder: String(c.sortOrder ?? 0),
                        });
                        setEditingCategory(c);
                      }} data-testid={`button-edit-category-${c.id}`}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeletingCategoryId(c.id)} data-testid={`button-delete-category-${c.id}`}>
                        Delete
                      </Button>
                    </div>
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

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          categories={categories.data ?? []}
          onClose={() => setEditingProduct(null)}
          updateProduct={updateProduct}
          qc={qc}
          onSuccess={() => setEditingProduct(null)}
        />
      )}

      {deletingProductId && (
        <DeleteProductModal
          product={products.data?.find((p) => p.id === deletingProductId)!}
          onClose={() => setDeletingProductId(null)}
          busy={deleteProduct.isPending}
          onConfirm={() => {
            deleteProduct.mutate(
              { productId: deletingProductId! },
              {
                onSuccess: () => {
                  qc.invalidateQueries({ queryKey: getGetProductsQueryKey() });
                  setDeletingProductId(null);
                },
              },
            );
          }}
        />
      )}

      {newCategory && (
        <CategoryForm
          value={newCategory}
          onChange={setNewCategory}
          busy={createCategory.isPending}
          onClose={() => setNewCategory(null)}
          onSubmit={() => {
            createCategory.mutate(
              {
                data: {
                  name: newCategory.name ?? "",
                  color: newCategory.color ?? "#6f9fb2",
                  group: newCategory.group ?? null,
                  station: newCategory.station ?? null,
                  sortOrder: Number(newCategory.sortOrder ?? 0),
                },
              },
              {
                onSuccess: () => {
                  qc.invalidateQueries({ queryKey: getGetCategoriesQueryKey() });
                  setNewCategory(null);
                },
              },
            );
          }}
        />
      )}

      {editingCategory && (
        <CategoryForm
          value={{
            name: editingCategory.name,
            color: editingCategory.color ?? "",
            group: editingCategory.group ?? "",
            station: editingCategory.station ?? "",
            sortOrder: String(editingCategory.sortOrder ?? 0),
          }}
          onChange={setNewCategory}
          busy={updateCategory.isPending}
          onClose={() => setEditingCategory(null)}
          onSubmit={() => {
            updateCategory.mutate(
              {
                categoryId: editingCategory.id,
                data: {
                  name: newCategory?.name ?? editingCategory.name,
                  color: newCategory?.color ?? editingCategory.color ?? "#6f9fb2",
                  group: newCategory?.group ?? editingCategory.group ?? null,
                  station: newCategory?.station ?? editingCategory.station ?? null,
                  sortOrder: Number(newCategory?.sortOrder ?? editingCategory.sortOrder ?? 0),
                },
              },
              {
                onSuccess: () => {
                  qc.invalidateQueries({ queryKey: getGetCategoriesQueryKey() });
                  setEditingCategory(null);
                  setNewCategory({ name: "", color: "#6f9fb2", group: "", station: "", sortOrder: "0" });
                },
              },
            );
          }}
        />
      )}

      {deletingCategoryId && (
        <DeleteCategoryModal
          category={categories.data?.find((c) => c.id === deletingCategoryId)!}
          onClose={() => setDeletingCategoryId(null)}
          busy={deleteCategory.isPending}
          onConfirm={() => {
            deleteCategory.mutate(
              { categoryId: deletingCategoryId! },
              {
                onSuccess: () => {
                  qc.invalidateQueries({ queryKey: getGetCategoriesQueryKey() });
                  setDeletingCategoryId(null);
                },
              },
            );
          }}
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
        <p className="text-xs text-[hsl(var(--app-ink-soft))]">
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
              className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--app-raised))] bg-[hsl(var(--app-surface))] px-4 py-3"
            >
              <div>
                <p className="text-sm font-bold uppercase tracking-wider">
                  {u.name}{" "}
                  {u.isBaseUnit && (
                    <span className="ml-1 rounded-full bg-[hsl(var(--app-success-soft))] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--app-success))]">
                      base
                    </span>
                  )}
                </p>
                <p className="font-mono text-[10px] text-[hsl(var(--app-muted))]">
                  {u.conversionFactor} {product.baseUnit} per {u.name.toLowerCase()}
                </p>
              </div>
              {editing === u.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-28 rounded-lg border border-[hsl(var(--app-line))] px-2 py-1 text-sm"
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
          className="grid gap-3 border-t border-[hsl(var(--app-line-soft))] pt-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--app-faint))]">
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

function EditProductModal({
  product,
  categories,
  onClose,
  updateProduct,
  qc,
  onSuccess,
}: {
  product: Product;
  categories: { id: string; name: string }[];
  onClose: () => void;
  updateProduct: ReturnType<typeof useUpdateProduct>;
  qc: ReturnType<typeof useQueryClient>;
  onSuccess: () => void;
}) {
  const { currency } = useMoney();
  const [draft, setDraft] = useState({
    name: product.name,
    categoryId: product.categoryId,
    price: String(product.price),
  });

  const set = (k: string, v: string) => setDraft({ ...draft, [k]: v });

  return (
    <Modal title="Edit product" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateProduct.mutate(
            {
              productId: product.id,
              data: {
                name: draft.name,
                categoryId: draft.categoryId,
                category:
                  categories.find((c) => c.id === draft.categoryId)?.name ??
                  product.category,
                price: Number(draft.price),
              },
            },
            {
              onSuccess: () => {
                qc.invalidateQueries({ queryKey: getGetProductsQueryKey() });
                onSuccess();
              },
            },
          );
        }}
        className="grid gap-4"
      >
        <Field label="Name">
          <input
            required
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
            data-testid="input-edit-product-name"
          />
        </Field>
        <Field label="Category">
          <select
            required
            value={draft.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            className={inputClass}
            data-testid="select-edit-product-category"
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Price (${currency})`}>
          <input
            required
            type="number"
            min={0}
            value={draft.price}
            onChange={(e) => set("price", e.target.value)}
            className={inputClass}
            data-testid="input-edit-product-price"
          />
        </Field>
        <Button className="mt-2 w-full" disabled={updateProduct.isPending} data-testid="button-save-edit-product">
          {updateProduct.isPending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Modal>
  );
}

function DeleteProductModal({
  product,
  onClose,
  busy,
  onConfirm,
}: {
  product: Product;
  onClose: () => void;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Delete product" onClose={onClose}>
      <p>Remove <strong>{product.name}</strong> from the menu?</p>
      <p className="text-xs text-[hsl(var(--app-faint))]">
        If it has been sold, it will be taken off the menu rather than deleted.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" disabled={busy} onClick={onConfirm}>
          {busy ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Modal>
  );
}

function DeleteCategoryModal({
  category,
  onClose,
  busy,
  onConfirm,
}: {
  category: Category;
  onClose: () => void;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Delete category" onClose={onClose}>
      <p>Remove <strong>{category.name}</strong> from the menu?</p>
      <p className="text-xs text-[hsl(var(--app-faint))]">
        Only possible if no products use this category.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" disabled={busy} onClick={onConfirm}>
          {busy ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Modal>
  );
}

function CategoryForm({
  value,
  onChange,
  onSubmit,
  onClose,
  busy,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  onSubmit: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });

  return (
    <Modal title="New category" onClose={onClose}>
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
            data-testid="input-category-name"
          />
        </Field>
        <Field label="Color">
          <input
            type="color"
            value={value.color ?? "#6f9fb2"}
            onChange={(e) => set("color", e.target.value)}
            className={inputClass}
            data-testid="input-category-color"
          />
        </Field>
        <Field label="Group (optional)">
          <input
            value={value.group ?? ""}
            onChange={(e) => set("group", e.target.value)}
            placeholder="e.g. Drinks, Food"
            className={inputClass}
            data-testid="input-category-group"
          />
        </Field>
        <Field label="Sort order">
          <input
            type="number"
            value={value.sortOrder ?? "0"}
            onChange={(e) => set("sortOrder", e.target.value)}
            className={inputClass}
            data-testid="input-category-sortorder"
          />
        </Field>
        <Button className="mt-2 w-full" disabled={busy} data-testid="button-save-category">
          {busy ? "Saving…" : "Create category"}
        </Button>
      </form>
    </Modal>
  );
}