import type { LocalDate } from "./types";
import { formatLocalDate, parseLocalDate } from "./zoned-time";

/**
 * PERIOD Goals (중간고사 준비, 여행 준비 …) are independent date ranges outside the YEAR → WEEK hierarchy.
 * Their status is always derived from the dates and never stored.
 */
export const PERIOD_GOAL_STATUSES = ["ACTIVE", "UPCOMING", "ENDED"] as const;
export type PeriodGoalStatus = (typeof PERIOD_GOAL_STATUSES)[number];

export interface DateRange {
  startDate: LocalDate;
  endDate: LocalDate;
}

export function periodGoalStatus(range: DateRange, today: LocalDate): PeriodGoalStatus {
  if (today < range.startDate) return "UPCOMING";
  if (today > range.endDate) return "ENDED";
  return "ACTIVE";
}

export function isDateInRange(date: LocalDate, range: DateRange): boolean {
  return range.startDate <= date && date <= range.endDate;
}

/**
 * The order a user scans PERIOD Goals in: running ones first (ending soonest), then upcoming ones
 * (starting soonest), then ended ones (most recent first).
 */
export function sortPeriodGoals<T extends DateRange & { title: string }>(goals: readonly T[], today: LocalDate): T[] {
  const rank = (goal: T) => PERIOD_GOAL_STATUSES.indexOf(periodGoalStatus(goal, today));
  return [...goals].sort((a, b) => {
    const byStatus = rank(a) - rank(b);
    if (byStatus !== 0) return byStatus;
    const status = periodGoalStatus(a, today);
    const byDate =
      status === "ACTIVE"
        ? a.endDate.localeCompare(b.endDate)
        : status === "UPCOMING"
          ? a.startDate.localeCompare(b.startDate)
          : b.endDate.localeCompare(a.endDate);
    return byDate || a.title.localeCompare(b.title);
  });
}

export type PeriodGoalFormIssue = "title" | "startDate" | "endDate" | "range";

/** The client-side twin of the server rules for a PERIOD Goal (title, both dates, start <= end). */
export function periodGoalFormIssue(values: { title: string; startDate: string; endDate: string }): PeriodGoalFormIssue | null {
  if (values.title.trim() === "") return "title";
  if (!isLocalDateValue(values.startDate)) return "startDate";
  if (!isLocalDateValue(values.endDate)) return "endDate";
  if (values.startDate > values.endDate) return "range";
  return null;
}

/**
 * Days whose plannedDate would fall outside a new range. The server refuses such a period change
 * (DATE_OUTSIDE_GOAL_PERIOD); the UI uses this to explain it before sending.
 */
export function daysOutsideRange<T extends { plannedDate: LocalDate | null }>(days: readonly T[], range: DateRange): T[] {
  return days.filter((day) => day.plannedDate !== null && !isDateInRange(day.plannedDate, range));
}

/**
 * One visual group of a PERIOD Goal's Days. The shape (key, range, Days) is deliberately not tied to
 * weeks, so a later optional grouping (e.g. sections) can produce the same structure.
 */
export interface DayGroup<T> {
  key: string;
  /** The dates the group covers, or null for Days without a date. */
  range: DateRange | null;
  days: T[];
}

/**
 * UI-only grouping of a PERIOD Goal's Days into Monday-start weeks, cut to the Goal range (the same
 * week rule the app uses elsewhere). Only weeks that have Days are returned, in date order, followed by
 * the Days without a date. Nothing here creates WEEK Goals.
 */
export function groupDaysByWeek<T extends { plannedDate: LocalDate | null }>(days: readonly T[], range: DateRange): DayGroup<T>[] {
  const dated = [...days]
    .filter((day): day is T & { plannedDate: LocalDate } => day.plannedDate !== null)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const groups = new Map<string, DayGroup<T>>();
  for (const day of dated) {
    const monday = mondayOf(day.plannedDate);
    const sunday = addDaysTo(monday, 6);
    const start = monday < range.startDate && day.plannedDate >= range.startDate ? range.startDate : monday;
    const end = sunday > range.endDate && day.plannedDate <= range.endDate ? range.endDate : sunday;
    const group = groups.get(monday) ?? { key: monday, range: { startDate: start, endDate: end }, days: [] };
    group.days.push(day);
    groups.set(monday, group);
  }
  const result = [...groups.values()];
  const undated = days.filter((day) => day.plannedDate === null);
  if (undated.length > 0) result.push({ key: "undated", range: null, days: [...undated] });
  return result;
}

function isLocalDateValue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = parseLocalDate(value);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return date.getUTCMonth() === parts.month - 1 && date.getUTCDate() === parts.day;
}

function toUtc(date: LocalDate): Date {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(date: Date): LocalDate {
  return formatLocalDate({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

function addDaysTo(date: LocalDate, amount: number): LocalDate {
  const value = toUtc(date);
  value.setUTCDate(value.getUTCDate() + amount);
  return fromUtc(value);
}

function mondayOf(date: LocalDate): LocalDate {
  const weekday = toUtc(date).getUTCDay(); // 0 = Sunday
  return addDaysTo(date, weekday === 0 ? -6 : 1 - weekday);
}
