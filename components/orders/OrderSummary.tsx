"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui";
import { Card } from "@/components/ui/card";

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

interface OrderSummaryProps {
  items: OrderItem[];
  onRemoveItem: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onSendToKitchen: () => void;
  onPayNow: () => void;
  organizationId: string;
  branchId: string | null;
}

export function OrderSummary({
  items,
  onRemoveItem,
  onUpdateQuantity,
  onSendToKitchen,
  onPayNow,
  organizationId,
  branchId,
}: OrderSummaryProps) {
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[hsl(var(--app-ink))]">Order</h3>
        <Badge variant="outline">{items.length}</Badge>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[hsl(var(--app-faint))]">
            <span className="text-[48px]">🍽️</span>
            <p className="mt-2 text-sm">No items in order</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-start gap-2">
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-[hsl(var(--app-ink))]">
                    {item.productName}
                  </span>
                  <span className="text-xs text-[hsl(var(--app-faint))]">
                    KES {item.unitPrice.toLocaleString()}
                  </span>
                  {item.unit_price !== undefined && (
                    <span className="text-[10px] text-[hsl(var(--app-warn))] font-medium">
                      Override
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Button variant="outline" size="sm" onClick={() => onUpdateQuantity(item.id, item.quantity - 1)} className="h-11 w-11 px-0">
                    −
                  </Button>
                  <span className="text-xs font-mono">{item.quantity}</span>
                  <Button variant="outline" size="sm" onClick={() => onUpdateQuantity(item.id, item.quantity + 1)} className="h-11 w-11 px-0">
                    +
                  </Button>
                  {item.notes && (
                    <span className="ml-2 text-[10px] text-[hsl(var(--app-faint))] italic">
                      {item.notes}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={() => onRemoveItem(item.id)} className="h-11 w-11 p-1">
                ×
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-[hsl(var(--app-line))]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[hsl(var(--app-faint))]">Subtotal</span>
          <span className="font-semibold text-[hsl(var(--app-ink))]">KES {subtotal.toLocaleString()}</span>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onSendToKitchen} className="flex-1">
            Send to Kitchen
          </Button>
          <Button variant="primary" size="sm" onClick={onPayNow} disabled={items.length === 0} className="flex-1">
            Pay Now
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: "outline" | "primary";
}

function Badge({ children, variant = "outline" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        variant === "outline"
          ? "border border-[hsl(var(--app-line))] text-[hsl(var(--app-faint))]"
          : "bg-[hsl(var(--app-gold))] text-[hsl(var(--app-ink))]"
      }`}
    >
      {children}
    </span>
  );
}
