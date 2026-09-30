import { useEffect, useRef } from "react";
import { useAuth, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { setUnauthorizedHandler } from "@workspace/api-client-react";

/**
 * Ends the session when the API reports it is no longer authenticated.
 *
 * The alternative was showing "Session expired — sign in again" in a panel
 * while the rest of the screen sat there failing. A dead session is not
 * something the person can act on from inside the page, so the app signs them
 * out and returns them to sign-in, with a note explaining why.
 */
export function useSessionGuard() {
  const { getToken, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const signingOut = useRef(false);

  useEffect(() => {
    if (!isSignedIn) {
      setUnauthorizedHandler(null);
      signingOut.current = false;
      return;
    }

    setUnauthorizedHandler(() => {
      if (signingOut.current) return;
      signingOut.current = true;

      // A stale session is still loaded in the cache. Clearing it means the
      // next sign-in never renders the previous person's data.
      queryClient.clear();

      void (async () => {
        // Ask Clerk for a fresh token first. If the session is genuinely alive
        // and only this one request failed, keep the user signed in.
        const token = await getToken().catch(() => null);
        if (token) {
          signingOut.current = false;
          return;
        }
        // Remember why, so sign-in can explain it.
        try {
          window.sessionStorage.setItem("dunda:session-ended", "1");
        } catch {
          // Storage may be unavailable; the redirect still happens.
        }
        await signOut({ redirectUrl: "/sign-in" });
        setLocation("/sign-in");
      })();
    });

    return () => setUnauthorizedHandler(null);
  }, [isSignedIn, getToken, signOut, setLocation, queryClient]);
}
