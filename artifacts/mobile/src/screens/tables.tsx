import { useQuery } from "@tanstack/react-query";
import { FlatList, Pressable, Text, View } from "react-native";
import { apiFetch } from "../lib/api";
import { useSession } from "../lib/session";
import { colors, money, statusColor } from "../lib/theme";
import { Card, Pill, Screen, State } from "../components/ui";

interface TableRow {
  id: string;
  name: string;
  section: string;
  seats: number;
  status: string;
  total: number;
  customer: string | null;
}

export default function TablesScreen() {
  const { branchId } = useSession();
  const tables = useQuery({
    queryKey: ["mobile-tables", branchId],
    enabled: Boolean(branchId),
    queryFn: () =>
      apiFetch<TableRow[]>(`/floors/tables?branchId=${encodeURIComponent(branchId!)}`),
  });

  const rows = tables.data ?? [];
  const sections = Array.from(new Set(rows.map((t) => t.section)));

  return (
    <Screen title="Tables" eyebrow="Floor">
      <State
        loading={tables.isLoading}
        error={tables.error}
        empty={!tables.isLoading && !tables.isError && rows.length === 0}
        emptyTitle="No tables yet"
        emptyHint="Tables appear once a manager designs the floor."
        onRetry={() => tables.refetch()}
      />
      <FlatList
        data={sections}
        keyExtractor={(s) => s}
        contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
        renderItem={({ item: section }) => (
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.mutedSoft, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" }}>
              {section}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {rows
                .filter((t) => t.section === section)
                .map((t) => {
                  const style = statusColor[t.status] ?? statusColor.AVAILABLE;
                  return (
                    <Pressable key={t.id} style={{ width: "48%" }}>
                      <Card
                        style={{
                          backgroundColor: style.bg,
                          borderColor: style.fg,
                          minHeight: 104,
                          justifyContent: "space-between",
                        }}
                      >
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 20, fontWeight: "800", color: style.fg }}>
                            {t.name}
                          </Text>
                          <Text style={{ color: style.fg, fontSize: 11 }}>{t.seats} pax</Text>
                        </View>
                        <View style={{ gap: 4 }}>
                          <Text style={{ color: style.fg, fontSize: 11, fontWeight: "600" }}>
                            {style.label}
                            {t.customer ? ` · ${t.customer}` : ""}
                          </Text>
                          {t.total > 0 ? (
                            <Text style={{ color: style.fg, fontSize: 15, fontWeight: "700" }}>
                              {money(t.total)}
                            </Text>
                          ) : null}
                        </View>
                      </Card>
                    </Pressable>
                  );
                })}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}
