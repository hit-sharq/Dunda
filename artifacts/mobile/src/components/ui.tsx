import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { colors } from "../lib/theme";

export function Screen({
  title,
  eyebrow,
  right,
  children,
}: {
  title: string;
  eyebrow?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 14,
          backgroundColor: colors.inkSoft,
        }}
      >
        {eyebrow ? (
          <Text
            style={{
              color: "#9fb0a8",
              fontSize: 10,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text style={{ color: "#f6efe2", fontSize: 26, fontWeight: "800" }}>{title}</Text>
          {right}
        </View>
      </View>
      <View style={{ flex: 1, padding: 16 }}>{children}</View>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.line,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "ghost";
  disabled?: boolean;
  style?: object;
}) {
  const bg =
    variant === "primary"
      ? colors.accent
      : variant === "outline"
        ? colors.surface
        : "transparent";
  const fg = variant === "primary" ? colors.accentInk : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: 48,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 16,
          backgroundColor: bg,
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: colors.line,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontWeight: "700", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "700" }}>{text}</Text>
    </View>
  );
}

export function State({
  loading,
  error,
  empty,
  emptyTitle,
  emptyHint,
  onRetry,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <View style={{ padding: 32, alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ padding: 24, alignItems: "center", gap: 12 }}>
        <Text style={{ color: colors.red, textAlign: "center" }}>{error}</Text>
        {onRetry ? <Button label="Retry" variant="outline" onPress={onRetry} /> : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={{ padding: 32, alignItems: "center", gap: 6 }}>
        <Text style={{ fontWeight: "700", fontSize: 16 }}>{emptyTitle}</Text>
        {emptyHint ? (
          <Text style={{ color: colors.mutedSoft, textAlign: "center", fontSize: 13 }}>
            {emptyHint}
          </Text>
        ) : null}
      </View>
    );
  }
  return null;
}

export function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <Text style={{ color: colors.mutedSoft, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ fontSize: 24, fontWeight: "800", marginTop: 6 }}>{value}</Text>
      {note ? <Text style={{ color: colors.mutedSoft, fontSize: 12, marginTop: 2 }}>{note}</Text> : null}
    </Card>
  );
}
