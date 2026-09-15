import { useSyncExternalStore } from "react";
import { minutesOfDay, toLocalDate } from "@/features/calendar/calendar-time";

// Re-read the clock every 30 seconds so positions move within a minute and dates roll over.
function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(timer);
}

const getToday = () => toLocalDate(new Date());
const getNowMinutes = () => minutesOfDay(new Date());

/** Today's local date (YYYY-MM-DD), or null during server rendering to avoid a stale build-time date. */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, getToday, () => null);
}

/** Current minute of the day in the browser timezone, or null during server rendering. */
export function useNowMinutes(): number | null {
  return useSyncExternalStore(subscribe, getNowMinutes, () => null);
}
