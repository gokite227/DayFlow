import type { CalendarGoalResponse as GoalResponse } from "@dayflow/api-client";
import { addDays, startOfWeek } from "../calendar/calendar-time";
import { goalPeriodLabel } from "./goal-period";
import { parsePeriodFilter, type PeriodGoalFilter } from "./period-goal-values";

/**
 * GOAL-005 view state for /goals, kept in the URL so a refresh or browser back returns to the same view:
 * /goals?view=year|quarter|month|week|period&layout=week|list&week=YYYY-MM-DD&status=ACTIVE|UPCOMING|ENDED
 * There is no global "전체" view; the YEAR flow lives in the Goal detail (/goals/{yearId}/flow, GOAL-006).
 * "period" lists the independent PERIOD Goals next to the four CALENDAR levels.
 */
export const GOALS_VIEWS = ["year", "quarter", "month", "week", "period"] as const;
export type GoalsViewName = (typeof GOALS_VIEWS)[number];
export type CalendarGoalsViewName = Exclude<GoalsViewName, "period">;

export const DEFAULT_GOALS_VIEW: GoalsViewName = "year";

export const WEEK_LAYOUTS = ["week", "list"] as const;
export type WeekLayout = (typeof WEEK_LAYOUTS)[number];

export const GOALS_VIEW_LABEL: Record<GoalsViewName, string> = {
  year: "연간",
  quarter: "분기",
  month: "월간",
  week: "주간",
  period: "기간",
};

export const WEEK_LAYOUT_LABEL: Record<WeekLayout, string> = { week: "주간형식", list: "리스트형식" };

/** The Goal type a CALENDAR view lists (and the default type for "+ 새 목표" there). */
export const VIEW_GOAL_TYPE: Record<CalendarGoalsViewName, GoalResponse["type"]> = {
  year: "YEAR",
  quarter: "QUARTER",
  month: "MONTH",
  week: "WEEK",
};

/** The view that lists a Goal of this type, used when returning from a detail without a `back` value. */
export const GOAL_TYPE_VIEW: Record<GoalResponse["type"], GoalsViewName> = {
  YEAR: "year",
  QUARTER: "quarter",
  MONTH: "month",
  WEEK: "week",
};

export interface GoalsViewState {
  view: GoalsViewName;
  layout: WeekLayout;
  /** Monday of the week shown by the week layout. */
  weekStart: string;
  /** Status filter of the period view. */
  status: PeriodGoalFilter;
}

const isDate = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseGoalsViewState(params: { get(name: string): string | null }, today: string): GoalsViewState {
  const view = params.get("view");
  const layout = params.get("layout");
  const week = params.get("week");
  return {
    view: (GOALS_VIEWS as readonly string[]).includes(view ?? "") ? (view as GoalsViewName) : DEFAULT_GOALS_VIEW,
    layout: (WEEK_LAYOUTS as readonly string[]).includes(layout ?? "") ? (layout as WeekLayout) : "week",
    weekStart: startOfWeek(isDate(week) ? week : today),
    status: parsePeriodFilter(params.get("status")),
  };
}

/** Query string for a view; parameters that do not apply to the view are left out. */
export function goalsViewHref(state: Partial<GoalsViewState> & { view: GoalsViewName }, today: string): string {
  const query = new URLSearchParams({ view: state.view });
  if (state.view === "week") {
    query.set("layout", state.layout ?? "week");
    if (state.weekStart && state.weekStart !== startOfWeek(today)) query.set("week", state.weekStart);
  }
  if (state.view === "period" && state.status && state.status !== "all") query.set("status", state.status);
  return `/goals?${query.toString()}`;
}

/**
 * Detail link that remembers the list the user came from, so "← 목표 목록으로" returns to that exact view
 * (`/goals/{id}?back=view%3Dweek%26layout%3Dlist`).
 */
export function goalDetailHref(goalId: string, listHref?: string): string {
  const query = listHref?.split("?")[1];
  return query ? `/goals/${goalId}?back=${encodeURIComponent(query)}` : `/goals/${goalId}`;
}

/** Where "← 목표 목록으로" goes: the remembered view, otherwise the view listing this Goal type. */
export function backToGoalsHref(back: string | null, type: GoalResponse["type"]): string {
  if (back !== null && back !== "") {
    const params = new URLSearchParams(back);
    const view = params.get("view");
    if ((GOALS_VIEWS as readonly string[]).includes(view ?? "")) return `/goals?${params.toString()}`;
  }
  return `/goals?view=${GOAL_TYPE_VIEW[type]}`;
}

/** Calendar deep link (GOAL-007): the week of a WEEK Goal, or today inside a MONTH Goal, else its first day. */
export function goalCalendarHref(
  goal: Pick<GoalResponse, "type" | "startDate" | "endDate">,
  today: string,
): string | null {
  if (goal.type !== "WEEK" && goal.type !== "MONTH") return null;
  const inside = goal.startDate <= today && today <= goal.endDate;
  // WEEK: its own (month-cut) start. MONTH: today when we are inside that month, otherwise its first day.
  const target = goal.type === "WEEK" ? goal.startDate : inside ? today : goal.startDate;
  return `/calendar?date=${target}`;
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
