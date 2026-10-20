"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  active: boolean;
  track_inventory: boolean;
  dunda_product_units: Array<{
    id: string;
    name: string;
    selling_price: number;
    conversion_factor: number;
    is_base_unit: boolean;
  }>;
}

interface ProductMenuProps {
  organizationId: string;
  branchId: string | null;
  onAddItem: (item: {
    productId: string;
    productName: string;
    unitId: string | null;
    unitName: string;
    unitPrice: number;
    quantity: number;
    notes: string | null;
    unit_price?: number;
    overridden_by_id?: string;
    override_reason?: string;
  }) => void;
}

export function ProductMenu({
  organizationId,
  branchId,
  onAddItem,
}: ProductMenuProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/products?organizationId=${organizationId}&active=true`,
          { credentials: "include" },
        );
        if (!cancelled && res.ok) {
          const data = await res.json();
          setProducts(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const categories = [...new Set(products.map((p) => p.category))];

  const filtered = products.filter(
    (p) =>
      p.active &&
      (!categoryFilter || p.category === categoryFilter) &&
      (!search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <Card className="p-3 h-full flex flex-col">
      <div className="flex gap-2 mb-3">
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCategoryFilter(null)}
          className="text-xs px-2"
        >
          All
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat}
            variant="outline"
            size="sm"
            onClick={() => setCategoryFilter(cat)}
            className={`text-xs px-2 ${categoryFilter === cat ? "bg-[hsl(var(--app-gold))] text-[hsl(var(--app-ink))]" : ""}`}
          >
            {cat}
          </Button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2">
        {filtered.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-8 text-[hsl(var(--app-faint))]">
            No products found
          </div>
        ) : (
          filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddItem={onAddItem}
            />
          ))
        )}
      </div>
    </Card>
  );
}

interface ProductCardProps {
  product: Product;
  onAddItem: (item: {
    productId: string;
    productName: string;
    unitId: string | null;
    unitName: string;
    unitPrice: number;
    quantity: number;
    notes: string | null;
    unit_price?: number;
    overridden_by_id?: string;
    override_reason?: string;
  }) => void;
}

function ProductCard({ product, onAddItem }: ProductCardProps) {
  const [open, setOpen] = useState(false);
  const baseUnit =
    product.dunda_product_units.find((u) => u.is_base_unit) ||
    product.dunda_product_units[0];

  return (
    <div className="group relative cursor-pointer">
      <div className="p-2 border border-[hsl(var(--app-line))] rounded-xl hover:border-[hsl(var(--app-gold))] transition-colors">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-[hsl(var(--app-ink))]">{product.name}</h3>
          <span className="text-xs font-medium text-[hsl(var(--app-gold))]">
            KES {product.price}
          </span>
        </div>
        <p className="text-[10px] text-[hsl(var(--app-faint))]">{product.category}</p>
        {!product.track_inventory && (
          <span className="mt-1 text-[10px] text-[hsl(var(--app-warn))]">
            No stock tracking
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="mt-2 w-full text-xs px-2"
        >
          Add
        </Button>
      </div>
      {open && (
        <ProductModal product={product} onClose={() => setOpen(false)} onAddItem={onAddItem} />
      )}
    </div>
  );
}

interface ProductModalProps {
  product: Product;
  onClose: () => void;
  onAddItem: (item: {
    productId: string;
    productName: string;
    unitId: string | null;
    unitName: string;
    unitPrice: number;
    quantity: number;
    notes: string | null;
    unit_price?: number;
    overridden_by_id?: string;
    override_reason?: string;
  }) => void;
}

function ProductModal({ product, onClose, onAddItem }: ProductModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [unitName, setUnitName] = useState("");

  const baseUnit =
    product.dunda_product_units.find((u) => u.is_base_unit) ||
    product.dunda_product_units[0];

  useEffect(() => {
    setUnitId(baseUnit?.id ?? null);
    setUnitName(baseUnit?.name ?? "piece");
    setUnitPrice(null);
  }, [product]);

  const defaultPrice = baseUnit?.selling_price ?? product.price;
  const currentPrice = unitPrice ?? defaultPrice;
  const isOverridden = unitPrice !== null && unitPrice !== defaultPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md p-4 bg-[hsl(var(--app-surface))] rounded-2xl shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[hsl(var(--app-ink))]">
            {product.name}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-medium text-[hsl(var(--app-faint))] mb-1">
              Unit
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const u = product.dunda_product_units.find((u) => u.id === unitId);
                const next =
                  product.dunda_product_units.find(
                    (u) => u.id !== (unitId ?? u?.id),
                  ) ||
                  product.dunda_product_units[0];
                setUnitId(next.id);
                setUnitName(next.name);
                setUnitPrice(null);
              }}
              className="w-full text-xs justify-between px-2"
            >
              {unitName}
              <span className="text-[10px] opacity-50">▼</span>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-[hsl(var(--app-faint))] mb-1">
                Quantity
              </label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="h-8 w-8">
                  −
                </Button>
                <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                <Button variant="outline" size="sm" onClick={() => setQuantity(quantity + 1)} className="h-8 w-8">
                  +
                </Button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-[hsl(var(--app-faint))] mb-1">
                Price (KES)
              </label>
              <input
                type="number"
                value={unitPrice ?? ""}
                onChange={(e) => setUnitPrice(e.target.value ? parseFloat(e.target.value) : null)}
                placeholder={String(defaultPrice)}
                className="w-full h-8 rounded-md border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-ink))] text-sm px-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--app-gold))]"
                disabled={!isOverridden && unitPrice === null}
              />
              {isOverridden && (
                <span className="text-[10px] text-[hsl(var(--app-warn))]">
                  Overriding catalog price
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-medium text-[hsl(var(--app-faint))] mb-1">
              Notes (optional)
            </label>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Special instructions..."
              rows={2}
              className="w-full h-24 rounded-md border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-ink))] text-sm px-2 py-2 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--app-gold))]"
            ></textarea>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onAddItem({
                  productId: product.id,
                  productName: product.name,
                  unitId,
                  unitName,
                  unitPrice: currentPrice,
                  quantity,
                  notes: overrideReason || null,
                  unit_price: isOverridden ? currentPrice : undefined,
                  overridden_by_id: isOverridden ? undefined : undefined,
                  override_reason: isOverridden ? overrideReason || undefined : undefined,
                });
                onClose();
              }}
              className="flex-1"
            >
              Add to Order
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
