/**
 * Calendar-date helpers for the device. Dates are "YYYY-MM-DD" strings; arithmetic runs on UTC
 * midnight so it never depends on the device timezone or DST. Until user settings exist (SET-001),
 * "today" is the device's local date and weeks start on Monday, like the Web.
 */
const pad = (value: number) => String(value).padStart(2, "0");

export const WEEKDAYS_KR = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** Local calendar date of an instant in the device timezone. */
export function toLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function utcMs(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function fromUtcMs(ms: number): string {
  const value = new Date(ms);
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

export function isLocalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtcMs(utcMs(value)) === value;
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(utcMs(date) + days * 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayIndex(date: string): number {
  return new Date(utcMs(date)).getUTCDay();
}

/**
 * First day of the week containing `date`. Monday by default: Goal WEEK periods and Review weeks always
 * use Monday; only Calendar display passes the user's week start.
 */
export function startOfWeek(date: string, weekStart: "monday" | "sunday" = "monday"): string {
  const firstWeekday = weekStart === "sunday" ? 0 : 1;
  return addDays(date, -((weekdayIndex(date) - firstWeekday + 7) % 7));
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / 86_400_000);
}

/** "9월 16일 (수)" */
export function koreanShortDate(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${WEEKDAYS_KR[weekdayIndex(date)]})`;
}

/** "2026년 9월 16일" */
export function formatKoreanDate(date: string): string {
  return `${Number(date.slice(0, 4))}년 ${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}

/** "14:05" */
export function formatMinutes(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** "오후 2:05", "오전 12:00" */
export function koreanTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour < 12 ? "오전" : "오후"} ${hour12}:${pad(minute)}`;
}

/**
 * The server renders offset date-times in the relevant timezone (Event or schedule), so the wall-clock
 * date and minutes are read straight from the string instead of converting through the device timezone.
 */
export function wallClock(offsetDateTime: string): { date: string; minutes: number } {
  return {
    date: offsetDateTime.slice(0, 10),
    minutes: Number(offsetDateTime.slice(11, 13)) * 60 + Number(offsetDateTime.slice(14, 16)),
  };
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}