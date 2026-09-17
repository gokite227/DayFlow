"use client";

import { useCallback, useSyncExternalStore } from "react";
import { shouldShowIosInstallHint } from "@/lib/pwa/install-context";
import { useInstallContext } from "@/lib/pwa/use-install-context";
import { IosSteps } from "./app-install-section";

const STORAGE_KEY = "dayflow.installHint.dismissed";
let memoryDismissed = false;
const listeners = new Set<() => void>();

function readDismissed(): boolean {
  if (memoryDismissed) return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A small, dismissible card on Today for iPhone Safari tabs only: how to add DayFlow to the home screen. Once closed it
 * stays closed on this browser; the same steps remain in Settings.
 */
export function IosInstallHint() {
  const context = useInstallContext();
  const dismissed = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readDismissed,
    () => true,
  );
  const dismiss = useCallback(() => {
    memoryDismissed = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Stays hidden for this session.
    }
    listeners.forEach((listener) => listener());
  }, []);

  if (!shouldShowIosInstallHint(context, dismissed)) return null;
  return (
    <section className="card app-install-card app-install-hint" aria-label="DayFlow를 앱처럼 사용하기">
      <div className="app-install-head">
        <strong>DayFlow를 앱처럼 사용하기</strong>
        <button type="button" className="btn ghost small" onClick={dismiss} aria-label="안내 닫기">
          닫기
        </button>
      </div>
      <IosSteps />
    </section>
  );
}
