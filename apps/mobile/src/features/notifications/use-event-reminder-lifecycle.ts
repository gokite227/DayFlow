import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { ensureEventReminderChannel } from "./notification-adapter";
import { routeForPayload } from "./notification-payload";
import { reconcileEventReminders } from "./reconcile-service";

/** Foreground returns closer together than this do not refetch Events for notifications again. */
const FOREGROUND_RECONCILE_INTERVAL_MS = 60_000;

/**
 * Mounted once in the root layout (only when the API is configured):
 * - app start: create the Android channel and reconcile;
 * - foreground: reconcile again (rolling window, changes made on the Web);
 * - notification tap: open the Event detail, also when the tap launched the app.
 */
export function useEventReminderLifecycle(): void {
  const router = useRouter();
  const lastForegroundRun = useRef(0);
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    void ensureEventReminderChannel()
      .catch(() => undefined)
      .then(() => reconcileEventReminders("app-start"));
    lastForegroundRun.current = Date.now();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || Date.now() - lastForegroundRun.current < FOREGROUND_RECONCILE_INTERVAL_MS) return;
      lastForegroundRun.current = Date.now();
      void reconcileEventReminders("foreground");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const route = routeForPayload(lastResponse.notification.request.content.data);
    if (!route) return;
    router.push(route);
    // Handled once: a later re-render or app restart must not open the same Event again.
    Notifications.clearLastNotificationResponse();
  }, [lastResponse, router]);
}