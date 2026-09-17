import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useDays } from "@/features/days/day-queries";
import { nextScheduleBoundary, planFocusSchedules, planKey } from "./focus-automation";
import { pruneDayPreferences } from "./focus-preferences";
import { useFocus } from "./focus-provider";

/**
 * Keeps the OS-scheduled Day Focus in line with the Days (mounted once in the root layout, signed in only).
 * The Days list query is observed here, so every Day mutation — create, time change, Calendar drag, date change,
 * schedule removal, delete, completion — invalidates it, refetches, and re-syncs. Settings and Day overrides
 * re-sync too, and so does every return to the foreground. Nothing here runs the automation itself: when DayFlow
 * is closed the OS alarms still fire.
 */
export function FocusAutomationSync() {
  const daysQuery = useDays();
  const { ready, storedSettings, dayPreferences, selection, syncSchedules, replaceDayPreferences, refresh, schedules, adapter } = useFocus();
  const lastKey = useRef<string | null>(null);
  const days = daysQuery.data;

  useEffect(() => {
    if (!ready || !days || !adapter.scheduler.available) return;
    const sync = (force: boolean) => {
      const entries = planFocusSchedules({ days, settings: storedSettings, preferences: dayPreferences, defaultApps: selection.apps, now: Date.now() });
      const key = planKey(entries);
      if (!force && key === lastKey.current) return;
      lastKey.current = key;
      syncSchedules(entries);
    };
    sync(false);
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") sync(true);
    });
    return () => subscription.remove();
  }, [ready, days, storedSettings, dayPreferences, selection.apps, syncSchedules, adapter.scheduler.available]);

  // Overrides of deleted Days are cleaned up once the full Day list is known.
  useEffect(() => {
    if (!ready || !days || daysQuery.isFetching) return;
    const pruned = pruneDayPreferences(dayPreferences, new Set(days.map((day) => day.id)));
    if (pruned !== dayPreferences) replaceDayPreferences(pruned);
  }, [ready, days, daysQuery.isFetching, dayPreferences, replaceDayPreferences]);

  // While DayFlow is open, look again when a schedule starts or ends (the OS already acted; this updates the UI).
  useEffect(() => {
    const boundary = nextScheduleBoundary(schedules, Date.now());
    if (boundary === null) return;
    const timer = setTimeout(refresh, Math.min(boundary - Date.now() + 2_000, 24 * 60 * 60_000));
    return () => clearTimeout(timer);
  }, [schedules, refresh]);

  return null;
}

/** After sign-out no Day of the previous account may still start a Focus on this device. */
export function FocusAutomationSignedOut() {
  const { ready, syncSchedules, adapter } = useFocus();
  const cleared = useRef(false);
  useEffect(() => {
    if (!ready || !adapter.scheduler.available || cleared.current) return;
    cleared.current = true;
    syncSchedules([]);
  }, [ready, syncSchedules, adapter.scheduler.available]);
  return null;
}
