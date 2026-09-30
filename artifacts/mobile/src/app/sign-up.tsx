import { ClerkLoaded, ClerkLoading, useOAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

export default function SignUpLayout() {
  const router = useRouter();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signUp = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { createdSessionId, setActive } = await startOAuthFlow();
      if (setActive && createdSessionId) router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [startOAuthFlow, router]);

  return (
    <View style={styles.container}>
      <ClerkLoading>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </ClerkLoading>
      <ClerkLoaded>
        <View style={styles.center}>
          <Text style={styles.title}>Join Dunda</Text>
          <Text style={styles.blurb}>
            Create your account, then ask an organization owner to link it to a staff
            record so your role and branch are applied.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            onPress={signUp}
            disabled={loading}
            style={[styles.cta, loading && { opacity: 0.6 }]}
          >
            <Text style={styles.ctaText}>
              {loading ? "Setting up…" : "Continue with Google"}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.secondary}>
            <Text style={styles.secondaryText}>I already have an account</Text>
          </Pressable>
        </View>
      </ClerkLoaded>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.inkSoft },
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { color: "#f6efe2", fontSize: 26, fontWeight: "800" },
  blurb: { color: "#9fb0a8", fontSize: 14, lineHeight: 21 },
  error: { color: "#f0a58c", fontSize: 13 },
  cta: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: colors.accentInk, fontWeight: "800", fontSize: 15 },
  secondary: { alignItems: "center", paddingVertical: 12 },
  secondaryText: { color: "#9fb0a8", fontSize: 13, fontWeight: "600" },
});
