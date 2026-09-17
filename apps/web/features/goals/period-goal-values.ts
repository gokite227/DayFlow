import type { CreateGoalRequest, DayResponse, GoalResponse, PeriodGoalResponse, UpdateGoalRequest } from "@dayflow/api-client";
import {
  PERIOD_GOAL_STATUSES,
  isDateInRange,
  periodGoalFormIssue,
  periodGoalStatus,
  sortPeriodGoals,
  type PeriodGoalFormIssue,
  type PeriodGoalStatus,
} from "@dayflow/domain";
import { summarizeDays, type DaySummary } from "../review/review-summary";
import { periodRangeLabel } from "./goal-period";

export const PERIOD_STATUS_LABEL: Record<PeriodGoalStatus, string> = {
  ACTIVE: "진행 중",
  UPCOMING: "예정",
  ENDED: "종료",
};

export const PERIOD_FILTERS = ["all", ...PERIOD_GOAL_STATUSES] as const;
export type PeriodGoalFilter = (typeof PERIOD_FILTERS)[number];

export const PERIOD_FILTER_LABEL: Record<PeriodGoalFilter, string> = { all: "전체", ...PERIOD_STATUS_LABEL };

export function parsePeriodFilter(value: string | null): PeriodGoalFilter {
  return (PERIOD_FILTERS as readonly string[]).includes(value ?? "") ? (value as PeriodGoalFilter) : "all";
}

/** The list for a filter, in the order 진행 중 → 예정 → 종료. */
export function filterPeriodGoals<T extends PeriodGoalResponse>(goals: readonly T[], filter: PeriodGoalFilter, today: string): T[] {
  const sorted = sortPeriodGoals(goals, today);
  return filter === "all" ? sorted : sorted.filter((goal) => periodGoalStatus(goal, today) === filter);
}

export function periodGoalsHref(filter: PeriodGoalFilter = "all"): string {
  return filter === "all" ? "/goals?view=period" : `/goals?view=period&status=${filter}`;
}

/** "캘린더에서 보기": the Calendar at the first day of the period. */
export function periodGoalCalendarHref(goal: Pick<PeriodGoalResponse, "startDate">): string {
  return `/calendar?date=${goal.startDate}`;
}

export interface PeriodGoalFormValues {
  title: string;
  startDate: string;
  endDate: string;
}

export function newPeriodGoalValues(today: string): PeriodGoalFormValues {
  return { title: "", startDate: today, endDate: "" };
}

export function periodGoalToValues(goal: PeriodGoalResponse): PeriodGoalFormValues {
  return { title: goal.title, startDate: goal.startDate, endDate: goal.endDate };
}

export const PERIOD_FORM_ISSUE_MESSAGE: Record<PeriodGoalFormIssue, string> = {
  title: "목표 제목을 입력해주세요.",
  startDate: "시작일을 골라주세요.",
  endDate: "종료일을 골라주세요.",
  range: "종료일은 시작일과 같거나 이후여야 해요.",
};

export { periodGoalFormIssue };

export const PERIOD_SHRINK_BLOCKED_MESSAGE = "연결된 Day 중 새 기간을 벗어나는 항목이 있어 기간을 변경할 수 없어요.";

export const PERIOD_DELETE_BLOCKED_MESSAGE =
  "연결된 Day가 있어 삭제할 수 없어요. Day의 목표 연결을 해제하거나 Day를 정리한 뒤 삭제해주세요.";

/** PERIOD Goals have no level, parent or manual progress; the Why stays empty until it is edited elsewhere. */
export function toCreatePeriodGoalRequest(values: PeriodGoalFormValues): CreateGoalRequest {
  return {
    kind: "PERIOD",
    type: null,
    parentGoalId: null,
    title: values.title.trim(),
    why: "",
    startDate: values.startDate,
    endDate: values.endDate,
    priority: 1,
    progressPolicy: "AUTO",
  };
}

/** Only title and dates change; the parent is omitted so it stays null. */
export function toUpdatePeriodGoalRequest(values: PeriodGoalFormValues, version: number): UpdateGoalRequest {
  return { title: values.title.trim(), startDate: values.startDate, endDate: values.endDate, version };
}

/** GOAL-003 for a PERIOD Goal: only the Days linked to it directly (it has no children). */
export function summarizePeriodGoal(days: readonly DayResponse[], goalId: string): DaySummary {
  return summarizeDays(days.filter((day) => day.goalId === goalId));
}

/** A Goal without countable Days shows 0%, not a dash. */
export function periodProgressLabel(summary: DaySummary): string {
  return `${Math.round((summary.completionRate ?? 0) * 100)}%`;
}

/** "완료 3 / 8" — let-go (SKIPPED) Days are not counted, like every other Goal progress. */
export function periodCountLabel(summary: DaySummary): string {
  return `완료 ${summary.done} / ${summary.total - summary.skipped}`;
}

/** The Goal label used on Day rows: PERIOD Goals are marked so they are not mistaken for a week. */
export function goalLinkLabel(goal: Pick<GoalResponse, "kind" | "title">): string {
  return goal.kind === "PERIOD" ? `기간 · ${goal.title}` : goal.title;
}

export interface GoalLink {
  href: string;
  label: string;
}

export function dayGoalLink(day: Pick<DayResponse, "goalId">, goalsById: ReadonlyMap<string, GoalResponse>): GoalLink | undefined {
  const goal = day.goalId === null ? undefined : goalsById.get(day.goalId);
  return goal ? { href: `/goals/${goal.id}`, label: goalLinkLabel(goal) } : undefined;
}

/** "중간고사 준비 · 9/21 ~ 10/8" (with "종료" for an ended Goal that is only kept as the current link). */
export function periodGoalOptionLabel(goal: PeriodGoalResponse, today: string): string {
  const ended = periodGoalStatus(goal, today) === "ENDED" ? " · 종료" : "";
  return `${goal.title} · ${periodRangeLabel(goal)}${ended}`;
}

/**
 * PERIOD Goals offered to a Day: running and upcoming ones. An ended Goal is still offered when the Day
 * is already linked to it, so editing that Day does not silently drop the link.
 */
export function selectablePeriodGoals(goals: readonly PeriodGoalResponse[], today: string, currentGoalId: string): PeriodGoalResponse[] {
  return sortPeriodGoals(goals, today).filter(
    (goal) => periodGoalStatus(goal, today) !== "ENDED" || goal.id === currentGoalId,
  );
}

/**
 * The client-side twin of DATE_OUTSIDE_WEEK_GOAL_PERIOD / DATE_OUTSIDE_GOAL_PERIOD: a dated Day must be
 * inside its Goal. The server stays the final check.
 */
export function dayDateProblem(
  goal: Pick<GoalResponse, "kind" | "startDate" | "endDate"> | undefined,
  plannedDate: string | null,
): string | null {
  if (!goal || plannedDate === null || plannedDate === "" || isDateInRange(plannedDate, goal)) return null;
  const range = periodRangeLabel(goal);
  return goal.kind === "PERIOD"
    ? `실행 날짜는 기간 목표 기간(${range}) 안이어야 해요.`
    : `실행 날짜는 주간 목표 기간(${range}) 안이어야 해요.`;
}

/** The date a new Day of the Goal starts with: today while it runs, otherwise its first day. */
export function defaultDayDate(goal: PeriodGoalResponse, today: string): string {
  return periodGoalStatus(goal, today) === "ACTIVE" ? today : goal.startDate;
}
