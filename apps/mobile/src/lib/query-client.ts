import { QueryClient, focusManager } from "@tanstack/react-query";
import { AppState, Platform, type AppStateStatus } from "react-native";

/** TanStack Query has no window focus on native: returning to the app counts as focus. */
export function wireAppStateFocus(): () => void {
  const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
    if (Platform.OS !== "web") focusManager.setFocused(status === "active");
  });
  return () => subscription.remove();
}

/**
 * Cached data stays visible when the API is unreachable (no offline mutation queue in this phase);
 * queries retry once and refetch when the app is focused again.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 30 * 60_000, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}