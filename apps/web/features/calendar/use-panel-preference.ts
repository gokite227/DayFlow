"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "dayflow.calendar.unscheduled";

/** Used when localStorage is unavailable (private mode, blocked site data), so the toggle still works. */
let memoryValue: boolean | null = null;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): boolean {
  if (memoryValue !== null) return memoryValue;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/**
 * Whether the Unscheduled panel is collapsed (CAL-006). A UI preference per browser, read through
 * useSyncExternalStore so the server render stays "expanded" without a hydration mismatch.
 */
export function useUnscheduledCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const toggle = useCallback(() => {
    const next = !collapsed;
    memoryValue = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "collapsed" : "expanded");
    } catch {
      // Keep the in-memory value for this session.
    }
    for (const listener of listeners) listener();
  }, [collapsed]);

  return [collapsed, toggle];
}
