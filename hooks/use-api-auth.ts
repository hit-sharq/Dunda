import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { setAuthTokenGetter } from "@/lib/api-client-react/src";


export function useApiAuth() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setAuthTokenGetter(null);
      return;
    }
    
    
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken, isSignedIn]);
}