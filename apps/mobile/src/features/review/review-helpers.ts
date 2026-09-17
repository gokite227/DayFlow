import type { GoalResponse, ReviewItemRequest, ReviewItemResponse, ReviewResponse, SaveReviewRequest } from "@dayflow/api-client";
import { addDays, startOfWeek } from "../../lib/dates";
import { sortGoals } from "../goals/goal-helpers";

export type ReviewType = ReviewResponse["type"];
export type ReviewItemKind = ReviewItemResponse["kind"];

export const REVIEW_TYPES: readonly ReviewType[] = ["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"];

export const REVIEW_TYPE_LABEL: Record<ReviewType, string> = { DAY: "일간", WEEK: "주간", MONTH: "월간", QUARTER: "분기", YEAR: "연간" };

/** Daily and weekly reviews look at WEEK Goals (same as the Web). */
export const REVIEW_GOAL_TYPE: Record<ReviewType, NonNullable<GoalResponse["type"]>> = { DAY: "WEEK", WEEK: "WEEK", MONTH: "MONTH", QUARTER: "QUARTER", YEAR: "YEAR" };

export const KPT_SECTIONS: readonly { kind: ReviewItemKind; title: string; hint: string; placeholder: string }[] = [
  { kind: "KEEP", title: "Keep", hint: "계속 유지하고 싶은 것", placeholder: "예: 오전에 개발하니 집중이 잘 됐다" },
  { kind: "PROBLEM", title: "Problem", hint: "막힌 점 · 아쉬웠던 점", placeholder: "예: 저녁 일정이 너무 많았다" },
  { kind: "TRY", title: "Try", hint: "다음 기간에 바꿔볼 것", placeholder: "예: 개발 시작 전에 30분 설계하기" },
];

export interface ReviewPeriod {
  type: ReviewType;
  start: string;
  end: string;
  label: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

function lastDayOfMonth(year: number, month: number): string {
  return `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
}

export function reviewPeriod(type: ReviewType, anchor: string): ReviewPeriod {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  switch (type) {
    case "DAY":
      return { type, start: anchor, end: anchor, label: `${month}월 ${Number(anchor.slice(8, 10))}일` };
    case "WEEK": {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      return { type, start, end, label: `${Number(start.slice(5, 7))}/${Number(start.slice(8, 10))} ~ ${Number(end.slice(5, 7))}/${Number(end.slice(8, 10))}` };
    }
    case "MONTH":
      return { type, start: `${year}-${pad(month)}-01`, end: lastDayOfMonth(year, month), label: `${year}년 ${month}월` };
    case "QUARTER": {
      const quarter = Math.floor((month - 1) / 3) + 1;
      const startMonth = (quarter - 1) * 3 + 1;
      return { type, start: `${year}-${pad(startMonth)}-01`, end: lastDayOfMonth(year, startMonth + 2), label: `${year} ${quarter}분기` };
    }
    case "YEAR":
      return { type, start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}년` };
  }
}

/** Anchor of the previous/next period (month-based types move to the 1st so short months never skip). */
export function shiftAnchor(type: ReviewType, anchor: string, delta: number): string {
  if (type === "DAY") return addDays(anchor, delta);
  if (type === "WEEK") return addDays(anchor, delta * 7);
  const months = type === "MONTH" ? delta : type === "QUARTER" ? delta * 3 : delta * 12;
  const shifted = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1 + months, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-01`;
}

const overlaps = (goal: Pick<GoalResponse, "startDate" | "endDate">, period: ReviewPeriod) =>
  goal.startDate <= period.end && goal.endDate >= period.start;

/** REV-003: Goals a line can reflect on (the review's level, overlapping the period). */
export function reviewGoalCandidates(goals: readonly GoalResponse[], period: ReviewPeriod): GoalResponse[] {
  return sortGoals(goals.filter((goal) => goal.kind === "CALENDAR" && goal.type === REVIEW_GOAL_TYPE[period.type] && overlaps(goal, period)));
}

/**
 * PERIOD Goals a line can reflect on: every PERIOD Goal overlapping the reviewed period, whatever the review
 * level (start <= review end and end >= review start). They are never a Try's next Goal.
 */
export function reviewPeriodGoalCandidates(goals: readonly GoalResponse[], period: ReviewPeriod): GoalResponse[] {
  return goals
    .filter((goal) => goal.kind === "PERIOD" && overlaps(goal, period))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

/** REV-004: later Goals of the same level a Try can be carried into, nearest first. */
export function nextGoalCandidates(goals: readonly GoalResponse[], period: ReviewPeriod): GoalResponse[] {
  return goals
    .filter((goal) => goal.kind === "CALENDAR" && goal.type === REVIEW_GOAL_TYPE[period.type] && goal.endDate > period.end)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

/** The saved line as a request, keeping both Goal links (PUT replaces the whole list). */
export function toItemRequest(item: ReviewItemResponse): ReviewItemRequest {
  return { id: item.id, kind: item.kind, content: item.content, goalId: item.goalId, targetGoalId: item.kind === "TRY" ? item.targetGoalId : null };
}

export interface ReviewChange {
  items?: ReviewItemRequest[];
  rating?: number | null;
  completed?: boolean;
}

/** Every change saves the whole review with expectedVersion (null for the first save). */
export function saveReviewRequest(review: ReviewResponse | null, change: ReviewChange): SaveReviewRequest {
  return {
    rating: change.rating !== undefined ? change.rating : (review?.rating ?? null),
    completed: change.completed ?? review?.completed ?? false,
    items: change.items ?? (review?.items ?? []).map(toItemRequest),
    expectedVersion: review?.version ?? null,
  };
}

export function addItemChange(review: ReviewResponse | null, kind: ReviewItemKind, content: string, goalId: string | null): ReviewChange {
  return { items: [...(review?.items ?? []).map(toItemRequest), { id: null, kind, content: content.trim(), goalId, targetGoalId: null }] };
}

export function removeItemChange(review: ReviewResponse, itemId: string): ReviewChange {
  return { items: review.items.filter((item) => item.id !== itemId).map(toItemRequest) };
}

/** Changes one link of one line; the Try → Day result stays untouched. */
export function linkItemChange(review: ReviewResponse, itemId: string, change: { goalId?: string | null; targetGoalId?: string | null }): ReviewChange {
  return { items: review.items.map((item) => (item.id === itemId ? { ...toItemRequest(item), ...change } : toItemRequest(item))) };
}
