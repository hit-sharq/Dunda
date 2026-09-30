import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { configureMoney } from "./theme";

export interface MobileBranch {
  id: string;
  name: string;
  city: string;
  status: string;
}

export interface MeResponse {
  organizationId: string;
  clerkUserId: string | null;
  staff: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    roleId: string;
    branchId: string | null;
    status: string;
  } | null;
  branchId: string | null;
  branches: MobileBranch[];
  role: string | null;
  roleId: string | null;
  permissions: string[];
  isOwner: boolean;
  settings: {
    currency: string;
    locale: string;
    taxRate: number;
    serviceChargeRate: number;
  };
}

interface SessionValue {
  ready: boolean;
  me: MeResponse | null;
  branch: MobileBranch | null;
  branchId: string | null;
  setBranchId: (id: string) => void;
  can: (permission: string) => boolean;
  /** True when the signed-in account has no Dunda staff record yet. */
  unlinked: boolean;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken, signOut } = useAuth();
  const { user } = useUser();

  const me = useQuery({
    queryKey: ["mobile-me", user?.id ?? "anonymous"],
    enabled: Boolean(isSignedIn),
    queryFn: async (): Promise<MeResponse> => {
      const token = await getToken();
      return apiFetch<MeResponse>("/me", { token });
    },
  });

  // Keep every money formatter in the app on the tenant's own currency.
  useMemo(() => {
    configureMoney(me.data?.settings?.locale ?? "en-KE", me.data?.settings?.currency ?? "KES");
  }, [me.data?.settings?.locale, me.data?.settings?.currency]);

  const value = useMemo<SessionValue>(() => {
    const data = me.data ?? null;
    const branchId = data?.branchId ?? data?.branches[0]?.id ?? null;
    return {
      ready: !me.isLoading && Boolean(isSignedIn),
      me: data,
      branch: data?.branches.find((b) => b.id === branchId) ?? data?.branches[0] ?? null,
      branchId,
      setBranchId: () => {
        // Branch switching is authorized server-side; the app only offers
        // branches the server has already scoped to this account.
      },
      can: (permission: string) =>
        data?.isOwner === true || (data?.permissions.includes(permission) ?? false),
      unlinked: Boolean(data && data.staff === null),
      signOut: () => {
        void signOut();
      },
    };
  }, [me.data, me.isLoading, isSignedIn, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
