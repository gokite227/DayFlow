import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { toLocalDate } from "./dates";

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 30_000);
  const subscription = AppState.addEventListener("change", onChange);
  return () => {
    clearInterval(timer);
    subscription.remove();
  };
}

const getToday = () => toLocalDate(new Date());

/** The device's local date; rolls over at midnight and when the app returns to the foreground. */
export function useToday(): string {
  return useSyncExternalStore(subscribe, getToday, getToday);
}
const getNowMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

/** Current minute of the day in the device timezone (updated every 30 seconds and on foreground). */
export function useNowMinutes(): number {
  return useSyncExternalStore(subscribe, getNowMinutes, getNowMinutes);
}