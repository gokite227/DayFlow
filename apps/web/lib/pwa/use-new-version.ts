"use client";

import { useEffect, useState } from "react";

const CURRENT_BUILD = process.env.NEXT_PUBLIC_DAYFLOW_BUILD_ID ?? "local";
/** A home screen app is resumed often; the version is checked at most this often. */
const CHECK_INTERVAL_MS = 5 * 60_000;

/** True when the server already serves a newer deployment than the one this page was loaded from. */
export function isNewerBuild(current: string, served: unknown): boolean {
  return current !== "local" && typeof served === "string" && served !== "" && served !== "local" && served !== current;
}

/**
 * Checks /app-version when DayFlow opens and whenever it comes back to the foreground, so a long-lived home screen
 * app can offer "새로고침" after a deployment. Failures (offline) are ignored.
 */
export function useNewVersionAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (CURRENT_BUILD === "local") return;
    let lastCheck = 0;
    let cancelled = false;
    const check = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
      lastCheck = Date.now();
      fetch("/app-version", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { buildId?: unknown } | null) => {
          if (!cancelled && body && isNewerBuild(CURRENT_BUILD, body.buildId)) setAvailable(true);
        })
        .catch(() => undefined);
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return available;
}
