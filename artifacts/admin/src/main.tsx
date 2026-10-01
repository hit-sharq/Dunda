import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { useAuth, useUser } from "@clerk/react";
import { useGetSession } from "@workspace/api-client-react";
import { Clients } from "./pages/clients";
import { ClientDetail } from "./pages/client-detail";
import { NewClient } from "./pages/new-client";
import { PlatformStaff } from "./pages/platform-staff";
import { AuditTrail } from "./pages/audit-trail";
import { AdminShell } from "./pages/shell";
import { colors } from "./lib/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // A 403 here means the account is not an administrator, which the gate
      // below handles. Retrying it cannot change the answer.
      retry: (count, error) => {
        const status = (error as { status?: number })?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return count < 2;
      },
    },
  },
});

/**
 * Which side of the product this account is on.
 *
 * The server answers it before tenant resolution, because an administrator
 * belongs to no club. An administrator cannot reach the club app and a club
 * staff member cannot reach this one, so the two are genuinely separate rather
 * than one app with a hidden menu.
 */
function Gate() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const session = useGetSession({
    query: { enabled: Boolean(isSignedIn), queryKey: ["getSession"] },
  });

  if (!isLoaded) {
    return (
      <Centered>Loading your workspace…</Centered>
    );
  }

  if (!isSignedIn) {
    return (
      <Centered>
        <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          Dunda admin
        </p>
        <p style={{ color: colors.muted, marginBottom: 18 }}>
          Sign in with an administrator account.
        </p>
        <a href="/sign-in" style={buttonStyle}>
          Sign in
        </a>
      </Centered>
    );
  }

  if (session.isLoading) {
    return <Centered>Checking your access…</Centered>;
  }

  if (session.isError) {
    return (
      <Centered>
        <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          Cannot reach the API
        </p>
        <p style={{ color: colors.muted, marginBottom: 18 }}>
          The admin app needs the Dunda API. Check that it is running.
        </p>
        <button style={buttonStyle} onClick={() => session.refetch()}>
          Try again
        </button>
      </Centered>
    );
  }

  if (session.data?.kind !== "admin") {
    return (
      <Centered>
        <p style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          Not an administrator
        </p>
        <p style={{ color: colors.muted, marginBottom: 8, maxWidth: 380 }}>
          This area is for Dunda administrators. You are signed in as{" "}
          {user?.primaryEmailAddress?.emailAddress ?? user?.id}, which is not on
          the administrator list.
        </p>
        <p style={{ color: colors.mutedSoft, fontSize: 12, marginBottom: 18 }}>
          Administrators are named in the deployment environment, not in the
          application. Ask whoever owns the deployment.
        </p>
        <button style={buttonStyle} onClick={() => signOut({ redirectUrl: "/" })}>
          Sign out
        </button>
      </Centered>
    );
  }

  return <AdminShell />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: colors.canvas,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div>{children}</div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  minHeight: 44,
  padding: "0 20px",
  borderRadius: 12,
  background: colors.accent,
  color: colors.ink,
  fontWeight: 700,
  fontSize: 14,
  lineHeight: "44px",
  border: "none",
  cursor: "pointer",
};

function NotFound() {
  return (
    <Centered>
      <p style={{ fontSize: 18, fontWeight: 700 }}>No such page.</p>
    </Centered>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Gate />
        </Router>
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>,
);
