import type { GoalResponse, ReviewResponse } from "@dayflow/api-client";
import { addDays, startOfWeek, toLocalDate } from "../calendar/calendar-time";

export type ReviewType = ReviewResponse["type"];

export const REVIEW_TYPES: readonly ReviewType[] = ["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"];

export const REVIEW_TYPE_LABEL: Record<ReviewType, string> = {
  DAY: "일간",
  WEEK: "주간",
  MONTH: "월간",
  QUARTER: "분기",
  YEAR: "연간",
};

/** Which Goals a review shows (prototype: daily and weekly reviews look at WEEK Goals). */
export const REVIEW_GOAL_TYPE: Record<ReviewType, GoalResponse["type"]> = {
  DAY: "WEEK",
  WEEK: "WEEK",
  MONTH: "MONTH",
  QUARTER: "QUARTER",
  YEAR: "YEAR",
};

export interface ReviewPeriod {
  type: ReviewType;
  start: string;
  end: string;
  label: string;
}

function parts(date: string) {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

function lastDayOfMonth(year: number, month: number) {
  return toLocalDate(new Date(year, month, 0));
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The period of `type` containing `anchor`. Weeks start on Monday until user settings exist. */
export function reviewPeriod(type: ReviewType, anchor: string): ReviewPeriod {
  const { year, month } = parts(anchor);
  switch (type) {
    case "DAY":
      return { type, start: anchor, end: anchor, label: anchor };
    case "WEEK": {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      return { type, start, end, label: `${start} ~ ${end}` };
    }
    case "MONTH":
      return { type, start: `${year}-${pad(month)}-01`, end: lastDayOfMonth(year, month), label: `${year}년 ${month}월` };
    case "QUARTER": {
      const quarter = Math.floor((month - 1) / 3) + 1;
      const startMonth = (quarter - 1) * 3 + 1;
      return {
        type,
        start: `${year}-${pad(startMonth)}-01`,
        end: lastDayOfMonth(year, startMonth + 2),
        label: `${year} Q${quarter}`,
      };
    }
    case "YEAR":
      return { type, start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}년` };
  }
}

/** Anchor of the previous/next period. */
export function shiftAnchor(type: ReviewType, anchor: string, delta: number): string {
  if (type === "DAY") return addDays(anchor, delta);
  if (type === "WEEK") return addDays(anchor, delta * 7);
  const { year, month } = parts(anchor);
  const months = type === "MONTH" ? delta : type === "QUARTER" ? delta * 3 : delta * 12;
  const shifted = new Date(year, month - 1 + months, 1);
  return toLocalDate(shifted);
}

export function overlaps(goal: Pick<GoalResponse, "startDate" | "endDate">, period: ReviewPeriod): boolean {
  return goal.startDate <= period.end && goal.endDate >= period.start;
}
