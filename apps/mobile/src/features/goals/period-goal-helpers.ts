import type { CreateGoalRequest, DayResponse, GoalResponse, PeriodGoalResponse, UpdateGoalRequest } from "@dayflow/api-client";
import {
  PERIOD_GOAL_STATUSES,
  isDateInRange,
  periodGoalStatus,
  sortPeriodGoals,
  type PeriodGoalFormIssue,
  type PeriodGoalStatus,
} from "@dayflow/domain";
import { periodRangeLabel, summarizeDays, type DaySummary } from "./goal-helpers";

/** PERIOD Goals on mobile: the same rules as the Web (status derived from dates, never stored). */
export const PERIOD_STATUS_LABEL: Record<PeriodGoalStatus, string> = { ACTIVE: "진행 중", UPCOMING: "예정", ENDED: "종료" };

export const PERIOD_STATUS_COLOR: Record<PeriodGoalStatus, string | undefined> = { ACTIVE: "#2a927f", UPCOMING: undefined, ENDED: "#8a8a8a" };

export const PERIOD_FILTERS = ["all", ...PERIOD_GOAL_STATUSES] as const;
export type PeriodGoalFilter = (typeof PERIOD_FILTERS)[number];
export const PERIOD_FILTER_LABEL: Record<PeriodGoalFilter, string> = { all: "전체", ...PERIOD_STATUS_LABEL };

export function parsePeriodFilter(value: string | undefined): PeriodGoalFilter {
  return (PERIOD_FILTERS as readonly string[]).includes(value ?? "") ? (value as PeriodGoalFilter) : "all";
}

/** 진행 중 → 예정 → 종료, optionally only one status. */
export function filterPeriodGoals<T extends PeriodGoalResponse>(goals: readonly T[], filter: PeriodGoalFilter, today: string): T[] {
  const sorted = sortPeriodGoals(goals, today);
  return filter === "all" ? sorted : sorted.filter((goal) => periodGoalStatus(goal, today) === filter);
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

export const PERIOD_SHRINK_BLOCKED_MESSAGE = "연결된 Day 중 새 기간을 벗어나는 항목이 있어 기간을 변경할 수 없어요.";

export const PERIOD_DELETE_BLOCKED_MESSAGE = "연결된 Day가 있어 삭제할 수 없어요. Day의 목표 연결을 해제하거나 Day를 정리한 뒤 삭제해주세요.";

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

export function toUpdatePeriodGoalRequest(values: PeriodGoalFormValues, version: number): UpdateGoalRequest {
  return { title: values.title.trim(), startDate: values.startDate, endDate: values.endDate, version };
}

/** GOAL-003 for a PERIOD Goal: its directly linked Days (it has no child Goals). */
export function summarizePeriodGoal(days: readonly DayResponse[], goalId: string): DaySummary {
  return summarizeDays(days.filter((day) => day.goalId === goalId));
}

export function periodProgressLabel(summary: DaySummary): string {
  return `${Math.round((summary.completionRate ?? 0) * 100)}%`;
}

export function periodCountLabel(summary: DaySummary): string {
  return `완료 ${summary.done} / ${summary.total - summary.skipped}`;
}

/** Running and upcoming PERIOD Goals for a Day; an ended one only when the Day is already linked to it. */
export function selectablePeriodGoals(goals: readonly PeriodGoalResponse[], today: string, currentGoalId: string): PeriodGoalResponse[] {
  return sortPeriodGoals(goals, today).filter((goal) => periodGoalStatus(goal, today) !== "ENDED" || goal.id === currentGoalId);
}

/** "중간고사 준비 · 9/21 ~ 10/8" (+ " · 종료") */
export function periodGoalOptionLabel(goal: PeriodGoalResponse, today: string): string {
  return `${goal.title} · ${periodRangeLabel(goal)}${periodGoalStatus(goal, today) === "ENDED" ? " · 종료" : ""}`;
}

/** The client-side twin of the server's Goal period rule for a dated Day (WEEK or PERIOD). */
export function dayDateProblem(goal: Pick<GoalResponse, "kind" | "startDate" | "endDate"> | undefined, plannedDate: string | null): string | null {
  if (!goal || plannedDate === null || plannedDate === "" || isDateInRange(plannedDate, goal)) return null;
  const range = periodRangeLabel(goal);
  return goal.kind === "PERIOD" ? `실행 날짜는 기간 목표 기간(${range}) 안이어야 해요.` : `실행 날짜는 주간 목표 기간(${range}) 안이어야 해요.`;
}

/** A new Day of the Goal starts today while the Goal runs, otherwise on its first day. */
export function defaultDayDate(goal: PeriodGoalResponse, today: string): string {
  return periodGoalStatus(goal, today) === "ACTIVE" ? today : goal.startDate;
}

/** Calendar link of a PERIOD Goal ("캘린더에서 보기"): the week that holds its first day. */
export function periodGoalCalendarParams(goal: Pick<PeriodGoalResponse, "startDate">): { date: string; view: "week" } {
  return { date: goal.startDate, view: "week" };
}
