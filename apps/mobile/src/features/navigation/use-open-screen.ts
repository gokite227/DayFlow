import { useRouter } from "expo-router";
import { useCallback } from "react";
import { useSettings } from "../settings/settings-provider";
import { screenLink, type ScreenParams } from "./app-routes";
import type { TabRoute } from "./tab-navigation";

/** Opens a top-level screen: its tab when it is in the tab bar, otherwise a stacked copy with a back button. */
export function useOpenScreen() {
  const router = useRouter();
  const { settings } = useSettings();
  return useCallback(
    (screen: TabRoute, params?: ScreenParams) => {
      const link = screenLink(screen, settings.bottomTabs, params);
      if (link.method === "push") router.push(link.href);
      else router.navigate(link.href);
    },
    [router, settings.bottomTabs],
  );
}
