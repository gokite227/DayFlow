import { useSyncExternalStore } from "react";
import { getMobileAuthSession } from "./auth-session";
import type { MobileAuthSession, MobileAuthState } from "./mobile-auth-session";

/** The auth session (only used below the root layout, which requires a configured API). */
export function useAuthSession(): MobileAuthSession {
  return getMobileAuthSession();
}

export function useAuthState(): MobileAuthState {
  const session = getMobileAuthSession();
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
