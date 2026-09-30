import { ClerkLoaded, ClerkLoading, useOAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

/**
 * Clerk Expo v2 has no bundled sign-in form component, so sign-in is driven by
 * the OAuth hooks. Add more providers here as the Clerk dashboard is configured.
 */
export default function AuthLayout() {
  const router = useRouter();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { createdSessionId, setActive } = await startOAuthFlow();
      if (setActive && createdSessionId) router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [startOAuthFlow, router]);

  useEffect(() => {
    void signIn();
    // Only auto-trigger once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <ClerkLoading>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </ClerkLoading>
      <ClerkLoaded>
        <View style={styles.center}>
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Text style={styles.markText}>D</Text>
            </View>
            <Text style={styles.wordmark}>dunda</Text>
          </View>
          <Text style={styles.tagline}>The club operating system</Text>
          <Text style={styles.blurb}>
            Run the floor, the bar and the stock room from your phone. Your role
            decides which modules open.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={signIn}
            disabled={loading}
            style={[styles.cta, loading && { opacity: 0.6 }]}
          >
            <Text style={styles.ctaText}>
              {loading ? "Signing in…" : "Continue with Google"}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.push("/sign-up")} style={styles.secondary}>
            <Text style={styles.secondaryText}>New here? Create an account</Text>
          </Pressable>
        </View>
      </ClerkLoaded>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.inkSoft },
  center: { flex: 1, justifyContent: "center", padding: 24, gap: 14 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { color: colors.accentInk, fontSize: 20, fontWeight: "800" },
  wordmark: { color: "#f6efe2", fontSize: 24, fontWeight: "800" },
  tagline: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  blurb: { color: "#9fb0a8", fontSize: 14, lineHeight: 21, marginBottom: 8 },
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
