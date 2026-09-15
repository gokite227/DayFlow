import type { DayResponse, SetDayScheduleRequest } from "@dayflow/api-client";

// Until user settings exist (SET-001), dates use the browser timezone and weeks start on Monday.

/** Every calendar time interaction (create, drag, drop, resize, time inputs) snaps to this. */
export const CALENDAR_SNAP_MINUTES = 15;
export const MIN_SCHEDULE_MINUTES = CALENDAR_SNAP_MINUTES;
export const MINUTES_PER_DAY = 24 * 60;

const pad = (value: number) => String(value).padStart(2, "0");

/** Local calendar date (YYYY-MM-DD) of a Date in the browser timezone. */
export function toLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function addDays(date: string, days: number): string {
  const result = parseLocalDate(date);
  result.setDate(result.getDate() + days);
  return toLocalDate(result);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  const mondayOffset = (parseLocalDate(date).getDay() + 6) % 7;
  return addDays(date, -mondayOffset);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekdayShort(date: string): string {
  return WEEKDAYS[parseLocalDate(date).getDay()] ?? "";
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

/** "Sep 14 – Sep 20" */
export function formatWeekRange(dates: readonly string[]): string {
  const label = (date: string | undefined) =>
    date ? `${MONTHS[Number(date.slice(5, 7)) - 1]} ${dayOfMonth(date)}` : "";
  return `${label(dates[0])} – ${label(dates[dates.length - 1])}`;
}

/** "2026년 9월 15일" */
export function formatKoreanDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

export function formatMinutes(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function parseTimeInput(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * The server renders startAt/endAt with the schedule timezone offset, so the wall-clock
 * date and minutes can be read straight from the string.
 */
export function wallClock(offsetDateTime: string): { date: string; minutes: number } {
  return {
    date: offsetDateTime.slice(0, 10),
    minutes: Number(offsetDateTime.slice(11, 13)) * 60 + Number(offsetDateTime.slice(14, 16)),
  };
}

export function durationMinutes(schedule: NonNullable<DayResponse["schedule"]>): number {
  return Math.round((Date.parse(schedule.endAt) - Date.parse(schedule.startAt)) / 60_000);
}

/** Nearest multiple of CALENDAR_SNAP_MINUTES (10:07 → 10:00, 10:08 → 10:15). */
export function snapMinutes(minutes: number): number {
  return Math.round(minutes / CALENDAR_SNAP_MINUTES) * CALENDAR_SNAP_MINUTES;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Schedule length for a Day without one: its estimate, snapped, at least the minimum. */
export function defaultScheduleLength(estimatedMinutes: number): number {
  return Math.max(snapMinutes(estimatedMinutes), MIN_SCHEDULE_MINUTES);
}

/** An instant string for a local date and minute of day in the browser timezone. */
export function toInstant(date: string, minutes: number): string {
  const result = parseLocalDate(date);
  result.setMinutes(minutes);
  return result.toISOString();
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * PUT /days/{dayId}/schedule body. `currentSchedule` decides expectedVersion: null creates a
 * schedule, the current version replaces it (optimistic concurrency).
 */
export function scheduleRequest(
  date: string,
  startMinutes: number,
  lengthMinutes: number,
  currentSchedule: DayResponse["schedule"],
  timezone = browserTimeZone(),
): SetDayScheduleRequest {
  return {
    startAt: toInstant(date, startMinutes),
    endAt: toInstant(date, startMinutes + lengthMinutes),
    timezone,
    expectedVersion: currentSchedule === null ? null : currentSchedule.version,
  };
}
