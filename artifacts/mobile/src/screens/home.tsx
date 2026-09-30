import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import { apiFetch } from "../lib/api";
import { useSession } from "../lib/session";
import { colors, money, orderStatusColor } from "../lib/theme";
import { Card, Metric, Pill, Screen, State } from "../components/ui";

interface Summary {
  revenue: number;
  orders: number;
  averageOrderValue: number;
  activeTables: number;
  totalTables: number;
  activeTabs: number;
  outstandingPayments: number;
  lowStockItems: number;
  upcomingEvents: number;
  reservations: number;
}

interface Alert {
  id: string;
  name: string;
  category: string;
  stock: number;
  minimum: number;
  unit: string;
  severity: "LOW" | "OUT";
}

interface OrderRow {
  id: string;
  number: string;
  table: string | null;
  status: string;
  total: number;
}

export default function HomeScreen() {
  const { branch, me } = useSession();

  const summary = useQuery({
    queryKey: ["mobile-summary", branch?.id],
    enabled: Boolean(branch),
    queryFn: () => apiFetch<Summary>("/dashboard/summary"),
  });

  const alerts = useQuery({
    queryKey: ["mobile-alerts", branch?.id],
    enabled: Boolean(branch),
    queryFn: () => apiFetch<Alert[]>("/inventory/alerts"),
  });

  const orders = useQuery({
    queryKey: ["mobile-orders", branch?.id],
    enabled: Boolean(branch),
    queryFn: () => apiFetch<OrderRow[]>("/orders"),
  });

  const s = summary.data;

  return (
    <Screen
      title={branch?.name ?? "Dunda"}
      eyebrow={`${me?.role ?? "Staff"} · ${me?.staff?.name ?? ""}`}
    >
      <State
        loading={summary.isLoading}
        error={summary.isError ? "Couldn't load the shift summary." : null}
        onRetry={() => summary.refetch()}
      />

      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Metric label="Revenue" value={s ? money(s.revenue) : "—"} />
          <Metric label="Orders" value={s ? String(s.orders) : "—"} />
          <Metric
            label="Avg order"
            value={s ? money(s.averageOrderValue) : "—"}
          />
          <Metric
            label="Active tables"
            value={s ? `${s.activeTables}/${s.totalTables}` : "—"}
          />
          <Metric
            label="Open tabs"
            value={s ? String(s.activeTabs) : "—"}
            note={s ? `${money(s.outstandingPayments)} outstanding` : undefined}
          />
          <Metric
            label="Low stock"
            value={s ? String(s.lowStockItems) : "—"}
            note={s ? `${s.upcomingEvents} events · ${s.reservations} bookings` : undefined}
          />
        </View>

        <Card>
          <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 10 }}>
            Active orders
          </Text>
          {!orders.data?.length ? (
            <Text style={{ color: colors.mutedSoft, fontSize: 13 }}>
              No open orders right now.
            </Text>
          ) : (
            orders.data
              .filter((o) => !["COMPLETED", "CANCELLED"].includes(o.status))
              .map((o) => {
                const style = orderStatusColor[o.status] ?? orderStatusColor.DRAFT;
                return (
                  <View
                    key={o.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 8,
                      borderTopWidth: 1,
                      borderTopColor: "#eee8de",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700" }}>{o.number}</Text>
                      <Text style={{ color: colors.mutedSoft, fontSize: 12 }}>
                        {o.table ?? "No table"}
                      </Text>
                    </View>
                    <Pill text={o.status} bg={style.bg} fg={style.fg} />
                    <Text style={{ fontWeight: "700", marginLeft: 10 }}>
                      {money(o.total)}
                    </Text>
                  </View>
                );
              })
          )}
        </Card>

        <Card>
          <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 10 }}>
            Needs attention
          </Text>
          <State
            loading={alerts.isLoading}
            empty={!alerts.isLoading && !alerts.data?.length}
            emptyTitle="Stock is healthy"
            emptyHint="Nothing is below its reorder level."
          />
          {alerts.data?.map((a) => (
            <View
              key={a.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 8,
                borderTopWidth: 1,
                borderTopColor: "#eee8de",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600" }}>{a.name}</Text>
                <Text style={{ color: colors.mutedSoft, fontSize: 12 }}>
                  min {a.minimum} {a.unit}
                </Text>
              </View>
              <Pill
                text={a.severity === "OUT" ? "Out" : "Low"}
                bg={a.severity === "OUT" ? colors.redSoft : colors.amberSoft}
                fg={a.severity === "OUT" ? colors.red : colors.amber}
              />
              <Text style={{ marginLeft: 10, fontWeight: "700" }}>
                {a.stock} {a.unit}
              </Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
