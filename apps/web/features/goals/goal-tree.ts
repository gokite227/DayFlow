import type { GoalResponse } from "@dayflow/api-client";
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

/** Goals that can be the parent of a Goal of `type`; `excludeId` skips the Goal being edited. */
export function parentCandidates(goals: readonly GoalResponse[], type: GoalType, excludeId?: string) {
  const parentType = parentTypeOf(type);
  if (parentType === null) return [];
  return sortGoals(goals.filter((goal) => goal.type === parentType && goal.id !== excludeId));
}

export interface GoalNode {
  goal: GoalResponse;
  children: GoalNode[];
}

/**
 * Builds the YEAR → WEEK hierarchy. Goals whose parent is not in the list are shown as
 * roots so no data is hidden.
 */
export function buildGoalTree(goals: readonly GoalResponse[]): GoalNode[] {
  const ids = new Set(goals.map((goal) => goal.id));
  const childrenByParent = new Map<string, GoalResponse[]>();
  for (const goal of goals) {
    if (goal.parentGoalId !== null && ids.has(goal.parentGoalId)) {
      const siblings = childrenByParent.get(goal.parentGoalId) ?? [];
      siblings.push(goal);
      childrenByParent.set(goal.parentGoalId, siblings);
    }
  }

  const toNode = (goal: GoalResponse): GoalNode => ({
    goal,
    children: sortGoals(childrenByParent.get(goal.id) ?? []).map(toNode),
  });

  return sortGoals(goals.filter((goal) => goal.parentGoalId === null || !ids.has(goal.parentGoalId))).map(
    toNode,
  );
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
