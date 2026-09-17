import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import { GOAL_TYPES, isCanonicalGoalPeriod, weekSegmentsOfMonth } from "@dayflow/domain";

export type GoalType = NonNullable<GoalResponse["type"]>;

export const GOAL_TYPE_ORDER: readonly GoalType[] = GOAL_TYPES;

export const GOAL_TYPE_LABEL: Record<GoalType, string> = { YEAR: "연간", QUARTER: "분기", MONTH: "월간", WEEK: "주간" };

export const CHILD_TYPE: Record<GoalType, GoalType | null> = { YEAR: "QUARTER", QUARTER: "MONTH", MONTH: "WEEK", WEEK: null };

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** "2026", "3분기", "9월", "9월 3주" (GOAL-004: derived from type + dates, never stored). */
export function goalPeriodLabel(goal: Pick<GoalResponse, "type" | "startDate" | "endDate">, withYear = false): string {
  if (goal.type === null) return `${md(goal.startDate)} ~ ${md(goal.endDate)}`;
  if (!isCanonicalGoalPeriod(goal.type, goal)) return `${md(goal.startDate)} ~ ${md(goal.endDate)}`;
  const year = Number(goal.startDate.slice(0, 4));
  const month = Number(goal.startDate.slice(5, 7));
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
export function periodRangeLabel(goal: Pick<GoalResponse, "startDate" | "endDate">): string {
  return goal.startDate === goal.endDate ? md(goal.startDate) : `${md(goal.startDate)} ~ ${md(goal.endDate)}`;
}

/** "9월 3주 · 백엔드 준비", or "기간 · 중간고사 준비 (9/21 ~ 10/8)" for a PERIOD Goal. */
export function goalChipLabel(goal: GoalResponse, withYear = false): string {
  if (goal.kind === "PERIOD") return `기간 · ${goal.title} (${periodRangeLabel(goal)})`;
  return `${goalPeriodLabel(goal, withYear)} · ${goal.title}`;
}

export function sortGoals(goals: readonly GoalResponse[]): GoalResponse[] {
  return [...goals].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      GOAL_TYPE_ORDER.indexOf(a.type ?? "YEAR") - GOAL_TYPE_ORDER.indexOf(b.type ?? "YEAR") ||
      a.title.localeCompare(b.title),
  );
}

/** GOAL-005 view list: the Goals of one type, in period order. */
export function goalsOfType(goals: readonly GoalResponse[], type: GoalType): GoalResponse[] {
  return sortGoals(goals.filter((goal) => goal.type === type));
}

/** Direct children only: Goals are explored one level at a time (drill-down), never as a tree. */
export function childrenOf(goals: readonly GoalResponse[], parentId: string): GoalResponse[] {
  return sortGoals(goals.filter((goal) => goal.parentGoalId === parentId));
}

/** Ancestors from the root down to (and including) the Goal. */
export function goalPath(goals: readonly GoalResponse[], goal: GoalResponse): GoalResponse[] {
  const byId = new Map(goals.map((candidate) => [candidate.id, candidate]));
  const path: GoalResponse[] = [];
  let current: GoalResponse | undefined = goal;
  while (current && path.length <= GOAL_TYPE_ORDER.length) {
    path.unshift(current);
    current = current.parentGoalId === null ? undefined : byId.get(current.parentGoalId);
  }
  return path;
}

export function isCurrentGoal(goal: Pick<GoalResponse, "startDate" | "endDate">, date: string): boolean {
  return goal.startDate <= date && date <= goal.endDate;
}

export interface DaySummary {
  total: number;
  done: number;
  open: number;
  skipped: number;
  /** done / (total - skipped); null when nothing is left to count. */
  completionRate: number | null;
  coreTotal: number;
  coreDone: number;
}

const OPEN_STATUSES: readonly DayResponse["status"][] = ["NOT_STARTED", "IN_PROGRESS", "DEFERRED"];

export function isOpenDay(day: Pick<DayResponse, "status">): boolean {
  return OPEN_STATUSES.includes(day.status);
}

export function summarizeDays(days: readonly DayResponse[]): DaySummary {
  const done = days.filter((day) => day.status === "DONE").length;
  const skipped = days.filter((day) => day.status === "SKIPPED").length;
  const counted = days.length - skipped;
  const core = days.filter((day) => day.coreDay);
  return {
    total: days.length,
    done,
    open: days.filter(isOpenDay).length,
    skipped,
    completionRate: counted > 0 ? done / counted : null,
    coreTotal: core.length,
    coreDone: core.filter((day) => day.status === "DONE").length,
  };
}

export function goalSubtreeIds(goals: readonly GoalResponse[], goalId: string): Set<string> {
  const ids = new Set([goalId]);
  let added = true;
  while (added) {
    added = false;
    for (const goal of goals) {
      if (goal.parentGoalId !== null && ids.has(goal.parentGoalId) && !ids.has(goal.id)) {
        ids.add(goal.id);
        added = true;
      }
    }
  }
  return ids;
}

/** GOAL-003: progress counts only Days linked to the Goal or its descendants; Days without a Goal never count. */
export function summarizeGoal(goals: readonly GoalResponse[], days: readonly DayResponse[], goalId: string): DaySummary {
  const ids = goalSubtreeIds(goals, goalId);
  return summarizeDays(days.filter((day) => day.goalId !== null && ids.has(day.goalId)));
}

export function formatRate(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}

export interface GoalFlowStage {
  type: GoalType;
  goals: GoalResponse[];
}

/** GOAL-006 on mobile: one YEAR's QUARTER → MONTH → WEEK Goals as vertical stages. */
export function yearFlowStages(goals: readonly GoalResponse[], yearId: string): GoalFlowStage[] {
  const quarters = childrenOf(goals, yearId);
  const months = sortGoals(quarters.flatMap((quarter) => childrenOf(goals, quarter.id)));
  const weeks = sortGoals(months.flatMap((month) => childrenOf(goals, month.id)));
  return [
    { type: "QUARTER", goals: quarters },
    { type: "MONTH", goals: months },
    { type: "WEEK", goals: weeks },
  ];
}
