import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { apiFetch } from "../lib/api";
import { useSession } from "../lib/session";
import { colors, money } from "../lib/theme";
import { Button, Card, Pill, Screen, State } from "../components/ui";

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  baseUnit: string;
  stock: number;
  available: boolean;
}

interface Unit {
  id: string;
  name: string;
  conversionFactor: number;
  sellingPrice: number;
  wholeUnitsOnly: boolean;
  isBaseUnit: boolean;
}

interface OpenTab {
  id: string;
  number: string;
  customer: string;
  table: string;
  total: number;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  items: {
    id: string;
    name: string;
    quantity: number;
    unitName: string | null;
    unitPrice: number;
    total: number;
  }[];
}



export default function OrderScreen() {
  const { branchId } = useSession();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [tabId, setTabId] = useState<string | null>(null);
  const [unitPicker, setUnitPicker] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  const products = useQuery({
    queryKey: ["mobile-products", branchId],
    queryFn: () => apiFetch<Product[]>("/products"),
  });

  const tabs = useQuery({
    queryKey: ["mobile-tabs", branchId],
    enabled: Boolean(branchId),
    queryFn: () => apiFetch<OpenTab[]>("/tabs?status=OPEN"),
  });

  const units = useQuery({
    queryKey: ["mobile-units", unitPicker?.id],
    enabled: Boolean(unitPicker),
    queryFn: () => apiFetch<Unit[]>(`/products/${unitPicker!.id}/units`),
  });

  const addItem = useMutation({
    mutationFn: (v: { productId: string; unitId: string | null; qty: number; note: string }) =>
      apiFetch(`/tabs/${tabId}/items`, {
        method: "POST",
        body: {
          productId: v.productId,
          quantity: v.qty,
          unitId: v.unitId,
          notes: v.note || null,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mobile-tabs", branchId] }),
  });

  const list = products.data ?? [];
  // Derived from the catalog: a fixed taxonomy showed tabs for categories the
  // tenant does not sell and hid the ones it does.
  const categories = ["All", ...Array.from(new Set(list.map((p) => p.category)))];
  const filtered = list.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const tab = tabs.data?.find((t) => t.id === tabId) ?? null;

  return (
    <Screen
      title="Order"
      eyebrow={tab ? `${tab.number} · ${tab.table}` : "No open tab"}
      right={
        tab ? (
          <Pill text={money(tab.total)} bg={colors.accent} fg={colors.accentInk} />
        ) : undefined
      }
    >
      {!tab ? (
        <View style={{ gap: 12 }}>
          <Card>
            <Text style={{ fontWeight: "700", fontSize: 16 }}>Pick an open tab</Text>
            <Text style={{ color: colors.muted, marginTop: 4, fontSize: 13 }}>
              Open a tab from the Floor screen, then come back to add items.
            </Text>
          </Card>
          <State
            loading={tabs.isLoading}
            error={tabs.error}
            empty={!tabs.isLoading && !tabs.isError && !tabs.data?.length}
            emptyTitle="No open tabs"
            emptyHint="Open a table on the Floor screen to start a tab."
            onRetry={() => tabs.refetch()}
          />
          {tabs.data?.map((t) => (
            <Pressable key={t.id} onPress={() => setTabId(t.id)}>
              <Card>
                <Text style={{ fontWeight: "700" }}>
                  {t.table} · {t.customer}
                </Text>
                <Text style={{ color: colors.mutedSoft, marginTop: 2 }}>{money(t.total)}</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search or scan"
              placeholderTextColor={colors.mutedSoft}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.surface,
                paddingHorizontal: 14,
                color: colors.ink,
              }}
            />
            <Button
              label="Change"
              variant="outline"
              onPress={() => {
                setTabId(null);
                setUnitPicker(null);
              }}
              style={{ paddingHorizontal: 12 }}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8, paddingRight: 8 }}>
              {categories.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: category === c ? colors.inkSoft : colors.surface,
                    borderWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <Text
                    style={{
                      color: category === c ? "#f8f1e5" : colors.muted,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <FlatList
            data={filtered}
            keyExtractor={(p) => p.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => (
              <Pressable
                style={{ flex: 1 }}
                onPress={() => {
                  if (!tab) return;
                  setUnitPicker(item);
                  setQuantity(1);
                  setNote("");
                }}
              >
                <Card style={{ minHeight: 116, justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontSize: 11, color: colors.mutedSoft }}>{item.category}</Text>
                    <Text style={{ fontWeight: "700", marginTop: 2 }}>{item.name}</Text>
                  </View>
                  <View>
                    <Text style={{ color: "#b65332", fontWeight: "700" }}>
                      {money(item.price)}
                    </Text>
                    <Text style={{ color: colors.mutedSoft, fontSize: 10 }}>
                      {item.stock} {item.baseUnit}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            )}
            ListFooterComponent={
              tab.items.length ? (
                <Card style={{ marginTop: 10 }}>
                  <Text style={{ fontWeight: "700", marginBottom: 8 }}>Running tab</Text>
                  {tab.items.map((item) => (
                    <View
                      key={item.id}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        paddingVertical: 6,
                        borderTopWidth: 1,
                        borderTopColor: "#eee8de",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "600" }}>{item.name}</Text>
                        <Text style={{ color: colors.mutedSoft, fontSize: 11 }}>
                          {item.quantity}
                          {item.unitName ? ` × ${item.unitName}` : ""} @{" "}
                          {money(item.unitPrice)}
                        </Text>
                      </View>
                      <Text style={{ fontWeight: "700" }}>{money(item.total)}</Text>
                    </View>
                  ))}
                  <View style={{ marginTop: 10, gap: 4 }}>
                    <Row label="Subtotal" value={money(tab.subtotal)} />
                    <Row label="Service charge" value={money(tab.serviceCharge)} />
                    <Row label="Tax" value={money(tab.tax)} />
                    <Row label="Total" value={money(tab.total)} strong />
                  </View>
                </Card>
              ) : null
            }
          />
        </View>
      )}

      {unitPicker && tab ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.canvas,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            gap: 12,
            maxHeight: "80%",
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "800" }}>{unitPicker.name}</Text>
          <Text style={{ color: colors.mutedSoft, fontSize: 12 }}>
            Stock is tracked in {unitPicker.baseUnit}.
          </Text>
          <TextInput
            value={String(quantity)}
            onChangeText={(v) => setQuantity(Number(v.replace(/[^0-9.]/g, "")) || 1)}
            keyboardType="numeric"
            placeholder="Quantity"
            placeholderTextColor={colors.mutedSoft}
            style={{
              minHeight: 48,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
              color: colors.ink,
            }}
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note for the bar or kitchen"
            placeholderTextColor={colors.mutedSoft}
            style={{
              minHeight: 48,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
              color: colors.ink,
            }}
          />
          <State loading={units.isLoading} />
          <View style={{ gap: 8 }}>
            {(units.data ?? []).map((u) => (
              <Button
                key={u.id}
                label={`${u.name} · ${money(u.sellingPrice * quantity)}`}
                variant="outline"
                disabled={addItem.isPending}
                onPress={() => {
                  addItem.mutate(
                    { productId: unitPicker.id, unitId: u.id, qty: quantity, note },
                    { onSuccess: () => setUnitPicker(null) },
                  );
                }}
              />
            ))}
          </View>
          <Button label="Cancel" variant="ghost" onPress={() => setUnitPicker(null)} />
        </View>
      ) : null}
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: strong ? colors.ink : colors.muted, fontWeight: strong ? "800" : "500" }}>
        {label}
      </Text>
      <Text style={{ fontWeight: strong ? "800" : "600" }}>{value}</Text>
    </View>
  );
}
