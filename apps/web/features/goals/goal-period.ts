import type { GoalResponse } from "@dayflow/api-client";
import {
  childPeriodOptions,
  findParentCandidates,
  isCanonicalGoalPeriod,
  monthPeriod,
  quarterPeriod,
  weekSegmentsOfMonth,
  yearPeriod,
  type GoalPeriod,
} from "@dayflow/domain";

type GoalType = GoalResponse["type"];

// Period labels are derived from type + startDate/endDate (GOAL-004); they are never stored.

const parts = (date: string) => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) });
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** "2026", "3분기", "9월", "9월 3주". `withYear` adds the year where the short label needs context. */
export function goalPeriodLabel(goal: Pick<GoalResponse, "type" | "startDate" | "endDate">, withYear = false): string {
  if (!isCanonicalGoalPeriod(goal.type, goal)) {
    // Data created before GOAL-004 may still have a free range.
    return `${md(goal.startDate)} ~ ${md(goal.endDate)}`;
  }
  const { year, month } = parts(goal.startDate);
  const prefix = withYear ? `${year}년 ` : "";
  switch (goal.type) {
    case "YEAR":
      return String(year);
    case "QUARTER":
      return `${withYear ? `${year} ` : ""}${Math.floor((month - 1) / 3) + 1}분기`;
    case "MONTH":
      return `${prefix}${month}월`;
    case "WEEK": {
      const week = weekSegmentsOfMonth(year, month).find((segment) => segment.startDate === goal.startDate)?.week;
      return `${prefix}${month}월 ${week}주`;
    }
  }
}

/** "7/1 ~ 9/30" */
export function periodRangeLabel(period: GoalPeriod): string {
  return period.startDate === period.endDate ? md(period.startDate) : `${md(period.startDate)} ~ ${md(period.endDate)}`;
}

export interface PeriodChoice extends GoalPeriod {
  key: string;
  label: string;
}

function choice(type: GoalType, period: GoalPeriod, withYear = false): PeriodChoice {
  return { ...period, key: period.startDate, label: goalPeriodLabel({ type, ...period }, withYear) };
}

/** Periods a child can take inside its parent (quarters of a year, months of a quarter, weeks of a month). */
export function childPeriodChoices(parent: Pick<GoalResponse, "type" | "startDate">): PeriodChoice[] {
  const childType = ({ YEAR: "QUARTER", QUARTER: "MONTH", MONTH: "WEEK", WEEK: null } as const)[parent.type];
  return childType === null ? [] : childPeriodOptions(parent).map((period) => choice(childType, period));
}

/** Context-free choices for the global "새 목표" form: every period of `type` in a year (and month for weeks). */
export function periodChoicesInYear(type: GoalType, year: number, month = 1): PeriodChoice[] {
  switch (type) {
    case "YEAR":
      return [choice(type, yearPeriod(year))];
    case "QUARTER":
      return [1, 2, 3, 4].map((quarter) => choice(type, quarterPeriod(year, quarter), true));
    case "MONTH":
      return Array.from({ length: 12 }, (_, index) => choice(type, monthPeriod(year, index + 1), true));
    case "WEEK":
      return weekSegmentsOfMonth(year, month).map((week) => choice(type, week, true));
  }
}

export type ParentResolution =
  | { kind: "root" }
  | { kind: "context"; parent: GoalResponse }
  | { kind: "auto"; parent: GoalResponse }
  | { kind: "choose"; candidates: GoalResponse[] }
  | { kind: "none" };

/**
 * Who becomes the parent of a new Goal:
 * - YEAR has no parent.
 * - Inside a Goal detail, that Goal is the parent (no selection).
 * - Otherwise the valid parents are the Goals of the direct parent type that contain the period:
 *   one is selected automatically, several are offered, none asks to create the parent first.
 */
export function resolveParent(
  type: GoalType,
  period: GoalPeriod,
  goals: readonly GoalResponse[],
  context: GoalResponse | null,
): ParentResolution {
  if (type === "YEAR") return { kind: "root" };
  if (context) return { kind: "context", parent: context };
  const candidates = findParentCandidates(goals, type, period);
  if (candidates.length === 1) return { kind: "auto", parent: candidates[0]! };
  if (candidates.length > 1) return { kind: "choose", candidates };
  return { kind: "none" };
}
