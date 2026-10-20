"use client";

import { useState, useCallback } from "react";
import { TablePicker } from "@/components/orders/TablePicker";
import { ProductMenu } from "@/components/orders/ProductMenu";
import { OrderSummary } from "@/components/orders/OrderSummary";
import { Card } from "@/components/ui/card";
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

export function WaiterOrder({ organizationId, branchId }: WaiterOrderProps) {
  const [selectedTable, setSelectedTable] = useState<{ id: string; name: string } | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);

  const handleTableSelect = useCallback((tableId: string, tableName: string) => {
    setSelectedTable({ id: tableId, name: tableName });
  }, []);

  const handleAddItem = useCallback((item: {
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
    const orderItem: OrderItem = {
      id: crypto.randomUUID(),
      ...item,
    };
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
          i.id === existing.id ? { ...i, quantity: i.quantity + item.quantity } : i,
        );
      }
      return [...prev, orderItem];
    });
  }, []);

  const handleRemoveItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const handleUpdateQuantity = useCallback((itemId: string, quantity: number) => {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity } : i)));
  }, []);

  const handleSendToKitchen = async () => {
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
      alert("Order sent to kitchen!");
    } else {
      alert("Failed to send order");
    }
  };

  const handlePayNow = async () => {
    if (items.length === 0 || !selectedTable) return;

    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", credentials: "include" },
      body: JSON.stringify({
        organizationId,
        branchId: selectedTable.id,
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
      const data = await res.json();
      alert(`Payment initiated! Reference: ${data.orderTrackingId}`);
    } else {
      alert("Failed to initiate payment");
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <TablePicker branchId={branchId} onTableSelect={handleTableSelect} />

      <div className="flex-1 flex gap-4">
        <div className="flex-1">
          <ProductMenu
            organizationId={organizationId}
            branchId={branchId}
            onAddItem={handleAddItem}
          />
        </div>

        <div className="w-[420px] flex-shrink-0">
          <OrderSummary
            items={items}
            onRemoveItem={handleRemoveItem}
            onUpdateQuantity={handleUpdateQuantity}
            onSendToKitchen={handleSendToKitchen}
            onPayNow={handlePayNow}
            organizationId={organizationId}
            branchId={branchId}
          />
        </div>
      </div>

      {selectedTable && (
        <div className="mt-2 flex items-center gap-2 text-[hsl(var(--app-faint))] text-sm">
          <span className="bg-[hsl(var(--app-gold-soft))] text-[hsl(var(--app-ink))] rounded-full px-2 py-0.5 text-[10px] font-medium">
            Table: {selectedTable.name}
          </span>
          <Button variant="outline" size="sm" onClick={() => setSelectedTable(null)}>
            Change table
          </Button>
        </div>
      )}
    </div>
  );
}
