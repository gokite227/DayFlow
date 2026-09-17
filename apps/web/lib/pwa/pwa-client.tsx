"use client";

import { useEffect } from "react";
import { listenForInstallPrompt } from "./install-prompt";

/**
 * Registers the service worker in production builds only (see public/sw.js: offline page only, no data caching) and
 * captures the Chromium install prompt. Renders nothing. A failed registration changes nothing for the app.
 */
export function PwaClient() {
  useEffect(() => {
    listenForInstallPrompt();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}
