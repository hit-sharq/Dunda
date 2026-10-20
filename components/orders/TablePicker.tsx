"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TableRow {
  id: string;
  name: string;
  status: string;
  tab_id: string | null;
}

interface TablePickerProps {
  branchId: string | null;
  onTableSelect: (tableId: string, tableName: string, tabId: string | null) => void;
}

const statusColors: Record<string, string> = {
  AVAILABLE: "bg-[hsl(var(--app-green-soft))] text-[hsl(var(--app-green))]",
  OCCUPIED: "bg-[hsl(var(--app-critical-soft))] text-[hsl(var(--app-critical))]",
  RESERVED: "bg-[hsl(var(--app-warn-soft))] text-[hsl(var(--app-warn))]",
  PAYMENT_PENDING: "bg-[hsl(var(--app-info-soft))] text-[hsl(var(--app-info))]",
};

export function TablePicker({ branchId, onTableSelect }: TablePickerProps) {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tables?branchId=${branchId ?? ""}`, {
          credentials: "include",
        });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setTables(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse rounded-2xl h-64 bg-[hsl(var(--app-surface))]"></div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[hsl(var(--app-ink))]">Tables</h3>
        <Badge variant="outline">{tables.length}</Badge>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {tables.map((table) => (
          <Button
            key={table.id}
            variant="outline"
            onClick={() => onTableSelect(table.id, table.name, table.tab_id)}
            className={`aspect-square min-h-[80px] px-2 text-xs flex flex-col items-center gap-1 ${statusColors[table.status] ?? "border-[hsl(var(--app-line))] text-[hsl(var(--app-faint))]"}`}
          >
            {table.name}
            <span className="text-[10px]">{table.status}</span>
          </Button>
        ))}
      </div>
    </Card>
  );
}
