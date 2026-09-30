import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

/**
 * Attaches the Clerk session token to every API request.
 *
 * Clerk keeps the session in the browser, so the API server cannot infer who the
 * caller is from cookies alone when the two run on different ports. The shared
 * client exposes a token getter for exactly this case: every call then carries
 * `Authorization: Bearer <session token>`, which clerkMiddleware verifies
 * server-side before the request reaches any route.
 */
export function useApiAuth() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setAuthTokenGetter(null);
      return;
    }
    // Let Clerk mint a fresh token per request so long shifts do not expire
    // mid-session.
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken, isSignedIn]);
}
