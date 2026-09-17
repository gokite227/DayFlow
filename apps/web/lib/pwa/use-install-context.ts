"use client";

import { useSyncExternalStore } from "react";
import { detectInstallContext, type InstallContext } from "./install-context";

const STANDALONE_QUERY = "(display-mode: standalone)";

let cachedKey = "";
let cached: InstallContext | null = null;

function read(): InstallContext {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  const next = detectInstallContext({
    userAgent: window.navigator.userAgent,
    maxTouchPoints: window.navigator.maxTouchPoints ?? 0,
    navigatorStandalone: navigatorWithStandalone.standalone,
    displayModeStandalone: window.matchMedia?.(STANDALONE_QUERY).matches ?? false,
  });
  const key = `${next.platform}:${next.standalone}`;
  if (key !== cachedKey || cached === null) {
    cachedKey = key;
    cached = next;
  }
  return cached;
}

function subscribe(listener: () => void) {
  const media = window.matchMedia?.(STANDALONE_QUERY);
  media?.addEventListener?.("change", listener);
  return () => media?.removeEventListener?.("change", listener);
}

/** null on the server and during hydration; the browser context afterwards. */
export function useInstallContext(): InstallContext | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
