import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateTable,
  useDeleteTable,
  useGetBranches,
  useGetFloors,
  useGetFloorTables,
  useUpdateTable,
  type Table,
} from "@/lib/api-client-react/src";
import {
  Button,
  Field,
  Modal,
  PageIntro,
  inputClass,
  money,
} from "../components/ui";
import { QueryNotice } from "../components/query-notice";

const statusStyles: Record<string, string> = {
  AVAILABLE: "border-[hsl(var(--app-success-soft))] bg-[hsl(var(--app-success-soft))] text-[hsl(var(--app-success))]",
  OCCUPIED: "border-[hsl(var(--app-gold-soft))] bg-[hsl(var(--app-gold-soft))] text-[hsl(var(--app-gold))]",
  RESERVED: "border-[hsl(var(--app-warn-soft))] bg-[hsl(var(--app-warn-soft))] text-[hsl(var(--app-warn))]",
  PAYMENT_PENDING: "border-[hsl(var(--app-critical-soft))] bg-[hsl(var(--app-critical-soft))] text-[hsl(var(--app-critical))]",
  CLEANING: "border-[hsl(var(--app-line))] bg-[hsl(var(--app-raised))] text-[hsl(var(--app-muted))]",
};

const statuses = ["AVAILABLE", "OCCUPIED", "RESERVED", "PAYMENT_PENDING", "CLEANING"] as const;

export function FloorDesigner() {
  const branches = useGetBranches();
  const [branchId, setBranchId] = useState("");
  const id = branchId || branches.data?.[0]?.id || "";
  const tables = useGetFloorTables(
    { branchId: id },
    { query: { enabled: Boolean(id), queryKey: ["getFloorTables", id] } },
  );
  const floors = useGetFloors(
    { branchId: id },
    { query: { enabled: Boolean(id), queryKey: ["getFloors", id] } },
  );
  const update = useUpdateTable();
  const remove = useDeleteTable();
  const create = useCreateTable();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<Table | null>(null);
  const [newTable, setNewTable] = useState<null | {
    name: string;
    section: string;
    seats: string;
  }>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const draggedPosition = useRef<{ id: string; x: number; y: number } | null>(null);

  function setNewTabTable() {
    setNewTable({ name: "", section: sections[0] ?? "Main", seats: "" });
  }
  const canvasRef = useRef<HTMLDivElement>(null);

  const rows: Table[] = tables.data ?? [];
  const sections = Array.from(new Set(rows.map((t) => t.section)));
  const live = selected ? rows.find((t) => t.id === selected.id) ?? selected : null;

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["getFloorTables", id] });
    void qc.invalidateQueries({ queryKey: ["getFloors", id] });
  }, [id, qc]);

  useEffect(() => {
    if (!dragging) return;
    const draggingId = dragging;
    function onMove(e: PointerEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.round(e.clientX - rect.left - 60));
      const y = Math.max(0, Math.round(e.clientY - rect.top - 30));
      draggedPosition.current = { id: draggingId, x, y };
      setSelected((prev) =>
        prev && prev.id === draggingId ? { ...prev, x, y } : prev,
      );
    }
    function onUp() {
      const position = draggedPosition.current;
      if (position?.id === draggingId) {
        update.mutate(
          { tableId: position.id, data: { x: position.x, y: position.y } },
          { onSuccess: refresh },
        );
      }
      draggedPosition.current = null;
      setDragging(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, refresh, update.mutate]);

  return (
    <div className="rise">
      <PageIntro
        eyebrow="Floor designer / layout"
        title="Shape the room"
        detail="Drag tables to position them, resize from the inspector, and set live status. Layout edits are scoped to managers."
        action={
          <div className="flex gap-2">
            <select
              value={id}
              onChange={(e) => {
                setBranchId(e.target.value);
                setSelected(null);
              }}
              className="h-10 rounded-xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] px-3 text-sm font-semibold outline-none"
              data-testid="select-designer-branch"
            >
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <Button
              onClick={() =>
                setNewTabTable()
              }
              data-testid="button-new-table"
            >
              + Table
            </Button>
          </div>
        }
      />

      <QueryNotice
        loading={tables.isLoading}
        error={tables.error}
        empty={!tables.isLoading && !tables.isError && !rows.length}
        onRetry={() => tables.refetch()}
        emptyTitle="No tables yet"
        emptyHint="Add your first table to start building the floor."
        emptyAction={
          <Button variant="outline" onClick={() =>
            setNewTabTable()
          }>
            Add table
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div
          ref={canvasRef}
          className="surface relative min-h-[560px] overflow-hidden rounded-2xl bg-[hsl(var(--app-surface))]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--app-line-soft)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--app-line-soft)) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
          data-testid="floor-canvas"
        >
          {rows.map((t: Table) => (
            <button
              key={t.id}
              onPointerDown={() => {
                setSelected(t);
                draggedPosition.current = { id: t.id, x: t.x ?? 0, y: t.y ?? 0 };
                setDragging(t.id);
              }}
              onClick={() => setSelected(t)}
              className={`absolute rounded-xl border-2 p-2 text-left transition-shadow ${
                statusStyles[t.status] ?? statusStyles.AVAILABLE
              } ${selected?.id === t.id ? "shadow-lg ring-2 ring-[hsl(var(--app-gold))]" : ""}`}
              style={{
                left: t.x,
                top: t.y,
                width: t.width,
                height: t.height,
                touchAction: "none",
              }}
              data-testid={`button-designer-table-${t.id}`}
            >
              <span className="block font-display text-base font-bold leading-tight">
                {t.name}
              </span>
              <span className="block font-mono text-[10px] opacity-80">
                {t.seats} pax · {t.status.replace("_", " ").toLowerCase()}
              </span>
              {t.total > 0 && (
                <span className="mt-1 block font-mono text-[10px] font-semibold">
                  {money(t.total)}
                </span>
              )}
            </button>
          ))}
          {rows.length === 0 && !tables.isLoading && (
            <p className="absolute inset-0 grid place-items-center text-sm text-[hsl(var(--app-muted))]">
              Empty floor. Add a table to begin.
            </p>
          )}
        </div>

        <aside className="surface h-fit rounded-2xl p-4">
          <h3 className="mb-4 font-display text-lg font-bold">Inspector</h3>
          {!live ? (
            <p className="text-sm text-[hsl(var(--app-ink-soft))]">
              Select a table on the canvas to edit its name, capacity, size and status.
            </p>
          ) : (
            <div className="grid gap-4" data-testid="table-inspector">
              <Field label="Name">
                <input
                  value={live.name}
                  onChange={(e) => setSelected({ ...live, name: e.target.value })}
                  onBlur={() =>
                    update.mutate(
                      { tableId: live.id, data: { name: live.name } },
                      { onSuccess: refresh },
                    )
                  }
                  className={inputClass}
                  data-testid="input-table-name"
                />
              </Field>
              <Field label="Section">
                <input
                  value={live.section}
                  onChange={(e) => setSelected({ ...live, section: e.target.value })}
                  onBlur={() =>
                    update.mutate(
                      { tableId: live.id, data: { section: live.section } },
                      { onSuccess: refresh },
                    )
                  }
                  className={inputClass}
                  data-testid="input-table-section"
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                {(["seats", "width", "height"] as const).map((k) => (
                  <Field key={k} label={k === "seats" ? "Seats" : k === "width" ? "W" : "H"}>
                    <input
                      type="number"
                      value={live[k]}
                      onChange={(e) =>
                        setSelected({ ...live, [k]: Number(e.target.value) })
                      }
                      onBlur={() =>
                        update.mutate({
                            tableId: live.id,
                            data: { [k]: live[k] },
                          }, { onSuccess: refresh })
                      }
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
              <Field label="Status">
                <div className="grid grid-cols-2 gap-1.5">
                  {statuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setSelected({ ...live, status: s });
                        update.mutate(
                          { tableId: live.id, data: { status: s } },
                          { onSuccess: refresh },
                        );
                      }}
                      className={`rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                        live.status === s
                          ? "border-[hsl(var(--app-gold))] bg-[hsl(var(--app-gold))] text-[hsl(var(--app-ink))]"
                          : "border-[hsl(var(--app-raised))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-ink-soft))]"
                      }`}
                      data-testid={`button-status-${s}`}
                    >
                      {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </Field>
              <Button
                variant="danger"
                onClick={() => {
                  if (live.status === "OCCUPIED") return;
                  remove.mutate(
                    { tableId: live.id },
                    { onSuccess: () => { setSelected(null); refresh(); } },
                  );
                }}
                data-testid="button-delete-table"
              >
                Delete table
              </Button>
            </div>
          )}

          <div className="mt-6 border-t border-[hsl(var(--app-line-soft))] pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--app-faint))]">
              Sections
            </p>
            <ul className="grid gap-1 text-xs text-[hsl(var(--app-ink-soft))]">
              {sections.map((s: string) => (
                <li key={s} className="flex justify-between">
                  <span>{s}</span>
                  <span className="font-mono">
                    {rows.filter((t: Table) => t.section === s).length}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10px] text-[hsl(var(--app-muted))]">
              {floors.data?.floors?.length ?? 0} floor(s) configured
            </p>
          </div>
        </aside>
      </div>

      {newTable && (
        <Modal title="Add a table" onClose={() => setNewTable(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                {
                  data: {
                    name: newTable.name,
                    section: newTable.section,
                    seats: Number(newTable.seats),
                    branchId: id,
                  },
                },
                { onSuccess: () => { setNewTable(null); refresh(); } },
              );
            }}
            className="grid gap-4"
          >
            <Field label="Name">
              <input
                required
                value={newTable.name}
                onChange={(e) => setNewTable({ ...newTable, name: e.target.value })}
                placeholder="T12 or VIP 03"
                className={inputClass}
                data-testid="input-new-table-name"
              />
            </Field>
            <Field label="Section">
              <input
                required
                value={newTable.section}
                onChange={(e) => setNewTable({ ...newTable, section: e.target.value })}
                className={inputClass}
                data-testid="input-new-table-section"
              />
            </Field>
            <Field label="Seats">
              <input
                type="number"
                min={1}
                value={newTable.seats}
                onChange={(e) => setNewTable({ ...newTable, seats: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Button className="w-full" disabled={create.isPending}>
              Add table
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}