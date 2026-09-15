import type { DayResponse } from "@dayflow/api-client";
import {
  CALENDAR_SNAP_MINUTES,
  MINUTES_PER_DAY,
  clamp,
  defaultScheduleLength,
  durationMinutes,
  snapMinutes,
  wallClock,
} from "./calendar-time";

/** Drop zones: a date's time grid, a date's date-only area, or the Unscheduled panel. */
export type DropTarget =
  | { kind: "time"; date: string }
  | { kind: "date"; date: string }
  | { kind: "unscheduled" };

export type DropAction =
  /** PUT schedule (create when the Day has none, replace otherwise). The server syncs plannedDate. */
  | { type: "setSchedule"; date: string; startMinutes: number; lengthMinutes: number }
  /** DELETE schedule (Day moves to the date-only area), then optionally change the date. */
  | { type: "unschedule"; moveToDate: string | null }
  /** PATCH plannedDate; null clears the date (and the server removes any schedule). */
  | { type: "moveDate"; date: string | null }
  | null;

/**
 * Decides what a drop means. `offsetPx` is how far the dragged item's top edge sits below the
 * top of the target time column; times snap to CALENDAR_SNAP_MINUTES.
 */
export function planDrop(day: DayResponse, target: DropTarget, offsetPx: number, hourHeight: number): DropAction {
  if (target.kind === "unscheduled") {
    return day.plannedDate === null ? null : { type: "moveDate", date: null };
  }

  if (target.kind === "date") {
    if (day.schedule) {
      return { type: "unschedule", moveToDate: target.date === day.plannedDate ? null : target.date };
    }
    return target.date === day.plannedDate ? null : { type: "moveDate", date: target.date };
  }

  const lengthMinutes = day.schedule
    ? durationMinutes(day.schedule)
    : defaultScheduleLength(day.estimatedMinutes);
  // The block must end by midnight: latest start is rounded down to the snap grid.
  const latestStart = Math.max(
    Math.floor((MINUTES_PER_DAY - lengthMinutes) / CALENDAR_SNAP_MINUTES) * CALENDAR_SNAP_MINUTES,
    0,
  );
  const startMinutes = clamp(snapMinutes((offsetPx / hourHeight) * 60), 0, latestStart);

  if (day.schedule) {
    const current = wallClock(day.schedule.startAt);
    if (current.date === target.date && current.minutes === startMinutes) return null;
  }
  return { type: "setSchedule", date: target.date, startMinutes, lengthMinutes };
}
