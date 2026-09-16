import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import { goalPath, isCurrentGoal } from "../goals/goal-helpers";

/** TODAY-001: today's Days, core Days first; no ranking by time or completion. */
export function todayDays(days: readonly DayResponse[], today: string): DayResponse[] {
  return days.filter((day) => day.plannedDate === today).sort((a, b) => Number(b.coreDay) - Number(a.coreDay));
}

/** WEEK Goals whose period contains today, in period order. */
export function currentWeekGoals(goals: readonly GoalResponse[], today: string): GoalResponse[] {
  return goals
    .filter((goal) => goal.type === "WEEK" && isCurrentGoal(goal, today))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

/** "2026 취업 › 3분기 › 9월 › 백엔드" for a Day with a Goal; null for a Day without one (DAY-001). */
export function dayGoalPath(day: Pick<DayResponse, "goalId">, goals: readonly GoalResponse[]): string | null {
  if (day.goalId === null) return null;
  const goal = goals.find((candidate) => candidate.id === day.goalId);
  return goal ? goalPath(goals, goal).map((ancestor) => ancestor.title).join(" › ") : null;
}

export interface TodayProgress {
  total: number;
  done: number;
}

export function todayProgress(days: readonly DayResponse[]): TodayProgress {
  const counted = days.filter((day) => day.status !== "SKIPPED");
  return { total: counted.length, done: counted.filter((day) => day.status === "DONE").length };
}