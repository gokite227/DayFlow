import type { Goal, GoalType, LocalDate } from "./types";
import { formatLocalDate, parseLocalDate } from "./zoned-time";

/**
 * GOAL-004: Goal periods are calendar periods, not free date ranges. startDate/endDate are the
 * canonical range derived from the selected period. Weeks start on Monday and are cut at the
 * boundaries of their parent month.
 */
export interface GoalPeriod {
  startDate: LocalDate;
  endDate: LocalDate;
}

export interface WeekSegment extends GoalPeriod {
  /** 1-based week number within the month. */
  week: number;
}

const DAY_MS = 86_400_000;

function toUtcMs(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): LocalDate {
  const date = new Date(ms);
  return formatLocalDate({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function yearPeriod(year: number): GoalPeriod {
  return { startDate: formatLocalDate({ year, month: 1, day: 1 }), endDate: formatLocalDate({ year, month: 12, day: 31 }) };
}

/** quarter: 1..4 */
export function quarterPeriod(year: number, quarter: number): GoalPeriod {
  const firstMonth = (quarter - 1) * 3 + 1;
  return {
    startDate: formatLocalDate({ year, month: firstMonth, day: 1 }),
    endDate: formatLocalDate({ year, month: firstMonth + 2, day: lastDayOfMonth(year, firstMonth + 2) }),
  };
}

/** month: 1..12 */
export function monthPeriod(year: number, month: number): GoalPeriod {
  return {
    startDate: formatLocalDate({ year, month, day: 1 }),
    endDate: formatLocalDate({ year, month, day: lastDayOfMonth(year, month) }),
  };
}

/** Monday-start weeks of a month, the first and last cut at the month boundary. */
export function weekSegmentsOfMonth(year: number, month: number): WeekSegment[] {
  const { startDate, endDate } = monthPeriod(year, month);
  const endMs = toUtcMs(endDate);
  const segments: WeekSegment[] = [];
  let startMs = toUtcMs(startDate);
  while (startMs <= endMs) {
    // getUTCDay: 0 = Sunday … 6 = Saturday; days until the week's Sunday.
    const daysToSunday = (7 - new Date(startMs).getUTCDay()) % 7;
    const segmentEndMs = Math.min(startMs + daysToSunday * DAY_MS, endMs);
    segments.push({ week: segments.length + 1, startDate: fromUtcMs(startMs), endDate: fromUtcMs(segmentEndMs) });
    startMs = segmentEndMs + DAY_MS;
  }
  return segments;
}

export function quarterOfMonth(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

/** The canonical period of `type` that contains `date`, or null for a date that does not exist. */
export function goalPeriodContaining(type: GoalType, date: LocalDate): GoalPeriod | null {
  const { year, month, day } = parseLocalDate(date);
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= lastDayOfMonth(year, month))) {
    return null;
  }
  switch (type) {
    case "YEAR":
      return yearPeriod(year);
    case "QUARTER":
      return quarterPeriod(year, quarterOfMonth(month));
    case "MONTH":
      return monthPeriod(year, month);
    case "WEEK":
      return weekSegmentsOfMonth(year, month).find((week) => week.startDate <= date && date <= week.endDate) ?? null;
  }
}

/** True when startDate..endDate is exactly one calendar period of the Goal type. */
export function isCanonicalGoalPeriod(type: GoalType, period: GoalPeriod): boolean {
  const canonical = goalPeriodContaining(type, period.startDate);
  return canonical !== null && canonical.startDate === period.startDate && canonical.endDate === period.endDate;
}

/** Child period choices inside a parent: quarters of a year, months of a quarter, weeks of a month. */
export function childPeriodOptions(parent: { type: GoalType; startDate: LocalDate }): GoalPeriod[] {
  const { year, month } = parseLocalDate(parent.startDate);
  switch (parent.type) {
    case "YEAR":
      return [1, 2, 3, 4].map((quarter) => quarterPeriod(year, quarter));
    case "QUARTER":
      return [0, 1, 2].map((offset) => monthPeriod(year, month + offset));
    case "MONTH":
      return weekSegmentsOfMonth(year, month);
    case "WEEK":
      return [];
  }
}

/** Goals that can directly contain a new Goal of `type` covering `period` (strict hierarchy). */
export function findParentCandidates<T extends Pick<Goal, "type" | "startDate" | "endDate">>(
  goals: readonly T[],
  type: GoalType,
  period: GoalPeriod,
): T[] {
  const parentType = PARENT_TYPE[type];
  if (parentType === null) return [];
  return goals.filter(
    (goal) => goal.type === parentType && goal.startDate <= period.startDate && period.endDate <= goal.endDate,
  );
}

const PARENT_TYPE: Readonly<Record<GoalType, GoalType | null>> = {
  YEAR: null,
  QUARTER: "YEAR",
  MONTH: "QUARTER",
  WEEK: "MONTH",
};
