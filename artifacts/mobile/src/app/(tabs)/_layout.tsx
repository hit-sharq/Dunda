import { Pressable, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { useSession } from "../../lib/session";
import { colors } from "../../lib/theme";

/**
 * Mobile is not a shrunken web app. Each role only sees the modules its
 * permissions allow, and the server re-checks every one of them.
 */
export default function TabsLayout() {
  const { ready, can, unlinked, signOut } = useSession();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
        <Text style={{ color: colors.muted }}>Loading your workspace…</Text>
      </View>
    );
  }

  if (unlinked) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 28,
          backgroundColor: colors.canvas,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "800", textAlign: "center" }}>
          No Dunda access yet
        </Text>
        <Text style={{ color: colors.muted, textAlign: "center", fontSize: 14 }}>
          Your account is not linked to a staff record. Ask an organization owner to
          invite you and assign your role and branch.
        </Text>
        <Pressable
          onPress={signOut}
          style={{
            minHeight: 48,
            paddingHorizontal: 20,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Text style={{ fontWeight: "700" }}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedSoft,
        tabBarStyle: { backgroundColor: colors.inkSoft, borderTopColor: "#2f434a" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarLabel: "Home" }} />
      <Tabs.Screen name="tables" options={{ title: "Tables" }} />
      {can("view_pos") ? (
        <Tabs.Screen name="order" options={{ title: "Order" }} />
      ) : null}
      {can("view_pos") ? (
        <Tabs.Screen name="scanner" options={{ title: "Scan", tabBarLabel: "Scan" }} />
      ) : null}
      {can("view_inventory") ? (
        <Tabs.Screen name="inventory" options={{ title: "Inventory", tabBarLabel: "Stock" }} />
      ) : null}
    </Tabs>
  );
}
