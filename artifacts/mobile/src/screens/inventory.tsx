import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { apiFetch } from "../lib/api";
import { useSession } from "../lib/session";
import { colors } from "../lib/theme";
import { Button, Card, Pill, Screen, State } from "../components/ui";

interface InventoryRow {
  id: string;
  productId: string | null;
  name: string;
  category: string | null;
  currentQuantity: number;
  reorderLevel: number;
  unit: string;
}

export default function InventoryScreen() {
  const { branchId, can } = useSession();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [amount, setAmount] = useState("0");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<"PURCHASE" | "WASTE" | "ADJUSTMENT">("ADJUSTMENT");

  const inventory = useQuery({
    queryKey: ["mobile-inventory", branchId],
    enabled: Boolean(branchId),
    queryFn: () => apiFetch<InventoryRow[]>("/inventory"),
  });

  const adjust = useMutation({
    mutationFn: (v: { productId: string; quantity: number; type: string; reason: string }) =>
      apiFetch("/inventory", {
        method: "POST",
        body: v,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mobile-inventory", branchId] });
      setAdjusting(null);
      setAmount("0");
      setReason("");
    },
  });

  const rows = (inventory.data ?? []).filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Screen title="Inventory" eyebrow="Stock room">
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search stock"
        placeholderTextColor={colors.mutedSoft}
        style={{
          minHeight: 48,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          color: colors.ink,
          marginBottom: 12,
        }}
      />

      <State
        loading={inventory.isLoading}
        error={inventory.isError ? "Couldn't load stock." : null}
        empty={!inventory.isLoading && !inventory.isError && rows.length === 0}
        emptyTitle="No stock records"
        emptyHint="Stock appears once products are received."
        onRetry={() => inventory.refetch()}
      />

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 32 }}
        renderItem={({ item }) => {
          const low = item.currentQuantity <= item.reorderLevel;
          return (
            <Pressable
              onPress={() => {
                if (!can("adjust_inventory") || !item.productId) return;
                setAdjusting(item);
                setAmount("0");
              }}
            >
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700" }}>{item.name}</Text>
                    <Text style={{ color: colors.mutedSoft, fontSize: 12, marginTop: 2 }}>
                      {item.category ?? "Uncategorised"} · min {item.reorderLevel} {item.unit}
                    </Text>
                  </View>
                  {low ? (
                    <Pill
                      text={item.currentQuantity <= 0 ? "Out" : "Low"}
                      bg={item.currentQuantity <= 0 ? colors.redSoft : colors.amberSoft}
                      fg={item.currentQuantity <= 0 ? colors.red : colors.amber}
                    />
                  ) : null}
                </View>
                <Text style={{ fontSize: 18, fontWeight: "800", marginTop: 8 }}>
                  {item.currentQuantity} {item.unit}
                </Text>
              </Card>
            </Pressable>
          );
        }}
      />

      {adjusting?.productId ? (
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
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "800" }}>{adjusting.name}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["ADJUSTMENT", "PURCHASE", "WASTE"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                  backgroundColor: type === t ? colors.inkSoft : colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Text
                  style={{
                    color: type === t ? "#f8f1e5" : colors.muted,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9.\-]/g, ""))}
            keyboardType="numeric"
            placeholder={`Quantity in ${adjusting.unit}`}
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
            value={reason}
            onChangeText={setReason}
            placeholder="Reason (recorded in the audit log)"
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
          <Button
            label={adjust.isPending ? "Saving…" : "Record movement"}
            disabled={adjust.isPending || Number(amount) === 0}
            onPress={() =>
              adjust.mutate({
                productId: adjusting.productId!,
                quantity: Number(amount),
                type,
                reason: reason || "Stock adjustment",
              })
            }
          />
          <Button label="Cancel" variant="ghost" onPress={() => setAdjusting(null)} />
        </View>
      ) : null}
    </Screen>
  );
}
