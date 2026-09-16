import type { DayResponse, GoalResponse } from "@dayflow/api-client";

// Only values the current Goal/Day API states exactly. Date changes, actual start times and focus
// time are not stored yet, so they are not shown.

export type DayStatus = DayResponse["status"];

/** Days still waiting to be done: they are what a recovery plan can reorganize. */
export const OPEN_STATUSES: readonly DayStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DEFERRED"];

export function isOpen(day: Pick<DayResponse, "status">): boolean {
  return OPEN_STATUSES.includes(day.status);
}

export interface DaySummary {
  total: number;
  done: number;
  open: number;
  /** Let go (SKIPPED), e.g. through a recovery plan. Not counted against the completion rate. */
  skipped: number;
  /** done / (total - skipped), or null when nothing is left to count. */
  completionRate: number | null;
  coreTotal: number;
  coreDone: number;
}

export function summarizeDays(days: readonly DayResponse[]): DaySummary {
  const done = days.filter((day) => day.status === "DONE").length;
  const skipped = days.filter((day) => day.status === "SKIPPED").length;
  const counted = days.length - skipped;
  const core = days.filter((day) => day.coreDay);
  return {
    total: days.length,
    done,
    open: days.filter(isOpen).length,
    skipped,
    completionRate: counted > 0 ? done / counted : null,
    coreTotal: core.length,
    coreDone: core.filter((day) => day.status === "DONE").length,
  };
}

/** The Goal and all its descendant Goal ids. */
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

/**
 * Summary of the period's Days that belong to the Goal (directly or through child Goals).
 * GOAL-003: Days without a Goal never count towards a Goal's progress (DAY-001).
 */
export function summarizeGoal(
  goals: readonly GoalResponse[],
  days: readonly DayResponse[],
  goalId: string,
): DaySummary {
  const ids = goalSubtreeIds(goals, goalId);
  return summarizeDays(days.filter((day) => day.goalId !== null && ids.has(day.goalId)));
}

export function formatRate(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}
