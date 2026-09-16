import type { DayPriority, DayResponse } from "@dayflow/api-client";
import { DAY_PRIORITIES } from "./day-values";

/**
 * DAY-006: the Days screen is the Task Inbox/Backlog. It loads the full Day list once and filters
 * it here, so switching views and tags needs no extra request. The API also supports
 * goalId/hasGoal/status/priority/tagId filters for other clients.
 */
export const DAYS_VIEWS = ["all", "upcoming", "unplanned", "done"] as const;
export type DaysView = (typeof DAYS_VIEWS)[number];

export const DAYS_VIEW_LABEL: Record<DaysView, string> = {
  all: "전체",
  upcoming: "예정",
  unplanned: "미배치",
  done: "완료",
};

/** Goal axis of the filter bar: every Day, only linked, only unlinked, or one WEEK Goal. */
export type GoalFilter = "all" | "with" | "without" | { goalId: string };

export interface DaysFilters {
  view: DaysView;
  goal: GoalFilter;
  /** Several Tags match with OR: a Day is kept when it has any of them (MVP rule). */
  tagIds: readonly string[];
  priority: DayPriority | "all";
  status: DayResponse["status"] | "all";
  /** Case-insensitive title search; empty means no search. */
  search: string;
}

export function emptyDaysFilters(view: DaysView = "all"): DaysFilters {
  return { view, goal: "all", tagIds: [], priority: "all", status: "all", search: "" };
}

/** DONE and SKIPPED are finished: they are not waiting to be done any more. */
function isFinished(day: DayResponse): boolean {
  return day.status === "DONE" || day.status === "SKIPPED";
}

/** The four Days views. "예정" keeps today's still open Days, "완료" only DONE. */
export function matchesView(day: DayResponse, view: DaysView, today: string): boolean {
  switch (view) {
    case "all":
      return true;
    case "upcoming":
      return day.plannedDate !== null && day.plannedDate >= today && !isFinished(day);
    case "unplanned":
      return day.plannedDate === null;
    case "done":
      return day.status === "DONE";
  }
}

function matchesGoal(day: DayResponse, goal: GoalFilter): boolean {
  if (goal === "all") return true;
  if (goal === "with") return day.goalId !== null;
  if (goal === "without") return day.goalId === null;
  return day.goalId === goal.goalId;
}

export function filterDays(days: readonly DayResponse[], filters: DaysFilters, today: string): DayResponse[] {
  const search = filters.search.trim().toLocaleLowerCase();
  return days.filter((day) => {
    if (!matchesView(day, filters.view, today)) return false;
    if (!matchesGoal(day, filters.goal)) return false;
    if (filters.priority !== "all" && day.priority !== filters.priority) return false;
    if (filters.status !== "all" && day.status !== filters.status) return false;
    if (filters.tagIds.length > 0 && !day.tags.some((tag) => filters.tagIds.includes(tag.id))) return false;
    if (search !== "" && !day.title.toLocaleLowerCase().includes(search)) return false;
    return true;
  });
}

/** Dated Days first (earliest first), then undated ones; higher priority before lower. */
export function sortDays(days: readonly DayResponse[]): DayResponse[] {
  const rank = (priority: DayPriority) => DAY_PRIORITIES.indexOf(priority);
  return [...days].sort(
    (a, b) =>
      Number(a.plannedDate === null) - Number(b.plannedDate === null) ||
      (a.plannedDate ?? "").localeCompare(b.plannedDate ?? "") ||
      rank(b.priority) - rank(a.priority) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

export function countByView(days: readonly DayResponse[], today: string): Record<DaysView, number> {
  return {
    all: days.length,
    upcoming: days.filter((day) => matchesView(day, "upcoming", today)).length,
    unplanned: days.filter((day) => matchesView(day, "unplanned", today)).length,
    done: days.filter((day) => matchesView(day, "done", today)).length,
  };
}

/** Whether anything besides the view narrows the list, so the screen can offer "필터 초기화". */
export function hasActiveFilters(filters: DaysFilters): boolean {
  return (
    filters.goal !== "all" ||
    filters.tagIds.length > 0 ||
    filters.priority !== "all" ||
    filters.status !== "all" ||
    filters.search.trim() !== ""
  );
}
