"use client";

import { useState, useCallback } from "react";
import { TablePicker } from "@/components/orders/TablePicker";
import { ProductMenu } from "@/components/orders/ProductMenu";
import { OrderSummary } from "@/components/orders/OrderSummary";
import { CollectPayment } from "@/components/orders/CollectPayment";
import { Button } from "@/components/ui";

interface WaiterOrderProps {
  organizationId: string;
  branchId: string | null;
}

interface OrderItem {
  id: string;
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
}

/**
 * The waiter screen, built for a phone held in one hand.
 *
 * On a small screen it is a single column: the table strip across the top,
 * the menu in the middle, and the order pinned to the bottom where the thumb
 * already is. On a tablet or a terminal it opens into two columns so a
 * waiter with a bigger screen can see the order and the menu at once.
 */
export function WaiterOrder({ organizationId, branchId }: WaiterOrderProps) {
  const [selectedTable, setSelectedTable] = useState<{
    id: string;
    name: string;
    tabId: string | null;
  } | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [showCart, setShowCart] = useState(false);

  const handleTableSelect = useCallback(
    (tableId: string, tableName: string, tabId: string | null) => {
      setSelectedTable({ id: tableId, name: tableName, tabId });
      setShowCart(false);
    },
    [],
  );

  const handleAddItem = useCallback(
    (item: {
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
    }) => {
      const orderItem: OrderItem = { id: crypto.randomUUID(), ...item };
      setItems((prev) => {
        const existing = prev.find(
          (i) =>
            i.productId === item.productId &&
            i.unitId === item.unitId &&
            i.unit_price === item.unit_price &&
            i.notes === item.notes,
        );
        if (existing) {
          return prev.map((i) =>
            i.id === existing.id
              ? { ...i, quantity: i.quantity + item.quantity }
              : i,
          );
        }
        return [...prev, orderItem];
      });
    },
    [],
  );

  const handleRemoveItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const handleUpdateQuantity = useCallback((itemId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, quantity } : i)),
    );
  }, []);

  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const sendOrder = async () => {
    if (items.length === 0 || !selectedTable) return;

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", credentials: "include" },
      body: JSON.stringify({
        organizationId,
        branchId,
        tableId: selectedTable.id,
        staffId: "",
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitId: i.unitId,
          notes: i.notes,
          unit_price: i.unit_price,
          overridden_by_id: i.overridden_by_id,
          override_reason: i.override_reason,
        })),
        notes: "",
        station: "BAR",
      }),
    });

    if (res.ok) {
      setItems([]);
      setSelectedTable(null);
      setShowCart(false);
      alert("Order sent to the kitchen.");
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Could not send the order.");
    }
  };

  const orderSummary = (
    <OrderSummary
      items={items}
      onRemoveItem={handleRemoveItem}
      onUpdateQuantity={handleUpdateQuantity}
      onSendToKitchen={sendOrder}
      onPayNow={() => setShowCart(true)}
      organizationId={organizationId}
      branchId={branchId}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col gap-3 lg:flex-row">
      {/* Table strip. On a phone it scrolls sideways so every table is one
          thumb swipe away. */}
      <div className="shrink-0 lg:w-[300px]">
        <TablePicker branchId={branchId} onTableSelect={handleTableSelect} />
      </div>

      {/* Menu */}
      <div className="min-w-0 flex-1">
        <ProductMenu
          organizationId={organizationId}
          branchId={branchId}
          onAddItem={handleAddItem}
        />
      </div>

      {/* On a tablet the order sits beside the menu. On a phone it slides up
          from the bottom instead, so the menu keeps the whole screen. */}
      <div className="hidden shrink-0 lg:block lg:w-[380px]">
        {selectedTable?.tabId ? (
          <div className="mb-3">
            <CollectPayment
              tabId={selectedTable.tabId}
              tableName={selectedTable.name}
            />
          </div>
        ) : null}
        {orderSummary}
      </div>

      {/* Phone: the sticky order bar and the sheet it opens. */}
      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        {items.length > 0 ? (
          <button
            onClick={() => setShowCart(true)}
            className="flex w-full items-center justify-between border-t border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] px-4 py-3 text-left shadow-[0_-4px_24px_rgba(0,0,0,0.12)]"
          >
            <span>
              <span className="block text-xs text-[hsl(var(--app-faint))]">
                {items.reduce((s, i) => s + i.quantity, 0)} item(s) · {selectedTable?.name}
              </span>
              <span className="block text-base font-bold text-[hsl(var(--app-ink))]">
                KES {subtotal.toLocaleString()}
              </span>
            </span>
            <span className="rounded-lg bg-[hsl(var(--app-gold))] px-3 py-2 text-xs font-bold text-[hsl(var(--app-ink))]">
              View order
            </span>
          </button>
        ) : null}
      </div>

      {showCart ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50 lg:hidden">
          <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-[hsl(var(--app-bg))] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-[hsl(var(--app-ink))]">
                Order {selectedTable?.name ? `· ${selectedTable.name}` : ""}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowCart(false)}>
                Close
              </Button>
            </div>
            {selectedTable?.tabId ? (
              <div className="mb-3">
                <CollectPayment
                  tabId={selectedTable.tabId}
                  tableName={selectedTable.name}
                />
              </div>
            ) : null}
            {orderSummary}
          </div>
        </div>
      ) : null}
    </div>
  );
}
