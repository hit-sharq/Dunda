import { useEffect, useRef } from "react";
import { useAuth, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { setUnauthorizedHandler } from "@/lib/api-client-react/src";


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

      
      
      queryClient.clear();

      void (async () => {
        
        
        const token = await getToken().catch(() => null);
        if (token) {
          signingOut.current = false;
          return;
        }
        
        try {
          window.sessionStorage.setItem("dunda:session-ended", "1");
        } catch {
          
        }
        await signOut({ redirectUrl: "/sign-in" });
        setLocation("/sign-in");
      })();
    });

    return () => setUnauthorizedHandler(null);
  }, [isSignedIn, getToken, signOut, setLocation, queryClient]);
}