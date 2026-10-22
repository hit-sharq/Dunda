"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so Dunda can be installed on a phone and
 * opens even when the network is poor. Only in production: during
 * development a cached shell gets in the way of every change.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
