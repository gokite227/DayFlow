import type { CalendarGoalResponse as GoalResponse } from "@dayflow/api-client";
import { GOAL_TYPES, getExpectedParentGoalType } from "@dayflow/domain";

export type GoalType = GoalResponse["type"];
export type ProgressPolicy = GoalResponse["progressPolicy"];

export const GOAL_TYPE_ORDER: readonly GoalType[] = GOAL_TYPES;

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  YEAR: "연간",
  QUARTER: "분기",
  MONTH: "월간",
  WEEK: "주간",
};

export const PROGRESS_POLICY_LABEL: Record<ProgressPolicy, string> = {
  AUTO: "자동 진행률",
  MANUAL: "수동 진행률",
};

/** The only allowed parent type (YEAR → QUARTER → MONTH → WEEK), from packages/domain. */
export function parentTypeOf(type: GoalType): GoalType | null {
  return getExpectedParentGoalType(type);
}

export function childTypeOf(type: GoalType): GoalType | null {
  return GOAL_TYPE_ORDER.find((candidate) => getExpectedParentGoalType(candidate) === type) ?? null;
}

/** Direct children only: the Goals screen drills down one level at a time instead of rendering a tree. */
export function childrenOf(goals: readonly GoalResponse[], parentId: string): GoalResponse[] {
  return sortGoals(goals.filter((goal) => goal.parentGoalId === parentId));
}

/** Ancestors from the root down to (and including) the goal. */
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

export function formatPeriod(goal: Pick<GoalResponse, "startDate" | "endDate">): string {
  return goal.startDate === goal.endDate ? goal.startDate : `${goal.startDate} ~ ${goal.endDate}`;
}

export function sortGoals(goals: readonly GoalResponse[]): GoalResponse[] {
  return [...goals].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      GOAL_TYPE_ORDER.indexOf(a.type) - GOAL_TYPE_ORDER.indexOf(b.type) ||
      a.title.localeCompare(b.title),
  );
}
