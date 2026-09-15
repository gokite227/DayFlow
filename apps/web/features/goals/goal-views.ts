import type { GoalResponse } from "@dayflow/api-client";
import { addDays, startOfWeek } from "../calendar/calendar-time";
import { goalPeriodLabel } from "./goal-period";

/**
 * GOAL-005 view state for /goals, kept in the URL so a refresh or browser back returns to the same view:
 * /goals?view=all|year|quarter|month|week&layout=week|list&week=YYYY-MM-DD&root={yearGoalId}
 */
export const GOALS_VIEWS = ["all", "year", "quarter", "month", "week"] as const;
export type GoalsViewName = (typeof GOALS_VIEWS)[number];

export const WEEK_LAYOUTS = ["week", "list"] as const;
export type WeekLayout = (typeof WEEK_LAYOUTS)[number];

export const GOALS_VIEW_LABEL: Record<GoalsViewName, string> = {
  all: "전체",
  year: "연간",
  quarter: "분기",
  month: "월간",
  week: "주간",
};

export const WEEK_LAYOUT_LABEL: Record<WeekLayout, string> = { week: "주간 뷰", list: "리스트 뷰" };

/** The Goal type a view lists (and the default type for "+ 새 목표" there). */
export const VIEW_GOAL_TYPE: Record<GoalsViewName, GoalResponse["type"]> = {
  all: "YEAR",
  year: "YEAR",
  quarter: "QUARTER",
  month: "MONTH",
  week: "WEEK",
};

export interface GoalsViewState {
  view: GoalsViewName;
  layout: WeekLayout;
  /** Monday of the week shown by the week layout. */
  weekStart: string;
  /** Limits the "전체" flow to one YEAR Goal. */
  rootId: string | null;
}

const isDate = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseGoalsViewState(params: { get(name: string): string | null }, today: string): GoalsViewState {
  const view = params.get("view");
  const layout = params.get("layout");
  const week = params.get("week");
  return {
    view: (GOALS_VIEWS as readonly string[]).includes(view ?? "") ? (view as GoalsViewName) : "all",
    layout: (WEEK_LAYOUTS as readonly string[]).includes(layout ?? "") ? (layout as WeekLayout) : "week",
    weekStart: startOfWeek(isDate(week) ? week : today),
    rootId: params.get("root"),
  };
}

/** Query string for a view; parameters that do not apply to the view are left out. */
export function goalsViewHref(state: Partial<GoalsViewState> & { view: GoalsViewName }, today: string): string {
  const query = new URLSearchParams({ view: state.view });
  if (state.view === "week") {
    query.set("layout", state.layout ?? "week");
    if (state.weekStart && state.weekStart !== startOfWeek(today)) query.set("week", state.weekStart);
  }
  if (state.view === "all" && state.rootId) query.set("root", state.rootId);
  return `/goals?${query.toString()}`;
}

export function overlapsRange(goal: Pick<GoalResponse, "startDate" | "endDate">, start: string, end: string): boolean {
  return goal.startDate <= end && goal.endDate >= start;
}

export function isCurrentGoal(goal: Pick<GoalResponse, "startDate" | "endDate">, today: string): boolean {
  return goal.startDate <= today && today <= goal.endDate;
}

/** "2026 일본계 회사 취업 › 3분기 취업 준비": the ancestors of a Goal, not the Goal itself. */
export function goalContext(goals: readonly GoalResponse[], goal: GoalResponse): string {
  const byId = new Map(goals.map((candidate) => [candidate.id, candidate]));
  const ancestors: GoalResponse[] = [];
  let parent = goal.parentGoalId ? byId.get(goal.parentGoalId) : undefined;
  while (parent && ancestors.length < 4) {
    ancestors.unshift(parent);
    parent = parent.parentGoalId ? byId.get(parent.parentGoalId) : undefined;
  }
  return ancestors.map((ancestor) => `${goalPeriodLabel(ancestor)} ${ancestor.title}`).join(" › ");
}

const byStart = (a: GoalResponse, b: GoalResponse) =>
  a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title);

export interface GoalFlow {
  year: GoalResponse;
  quarters: GoalResponse[];
  months: GoalResponse[];
  weeks: GoalResponse[];
}

/**
 * The flow of one YEAR Goal as four fixed stages (YEAR → QUARTER → MONTH → WEEK). Each stage lists the
 * Goals of that level under the YEAR in period order; the connection to the parent is shown as context,
 * so the hierarchy is visible without a recursive tree.
 */
export function goalFlows(goals: readonly GoalResponse[], rootId: string | null = null): GoalFlow[] {
  const childrenOf = (parents: readonly GoalResponse[]) => {
    const ids = new Set(parents.map((parent) => parent.id));
    return goals.filter((goal) => goal.parentGoalId !== null && ids.has(goal.parentGoalId)).sort(byStart);
  };
  return goals
    .filter((goal) => goal.type === "YEAR" && (rootId === null || goal.id === rootId))
    .sort(byStart)
    .map((year) => {
      const quarters = childrenOf([year]);
      const months = childrenOf(quarters);
      return { year, quarters, months, weeks: childrenOf(months) };
    });
}

/** WEEK Goals (month-cut segments) that touch the Monday-start week. */
export function weekGoalsInWeek(goals: readonly GoalResponse[], weekStart: string): GoalResponse[] {
  const weekEnd = addDays(weekStart, 6);
  return goals.filter((goal) => goal.type === "WEEK" && overlapsRange(goal, weekStart, weekEnd)).sort(byStart);
}

/** Dates of a WEEK Goal (at most 7, a cut week has fewer). */
export function datesOfGoal(goal: Pick<GoalResponse, "startDate" | "endDate">): string[] {
  const dates: string[] = [];
  for (let date = goal.startDate; date <= goal.endDate && dates.length < 7; date = addDays(date, 1)) dates.push(date);
  return dates;
}
