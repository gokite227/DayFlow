import type { CreateDayRequest, DayPriority, DayResponse, GoalResponse, UpdateDayRequest } from "@dayflow/api-client";
import { wallClock } from "../../lib/dates";
import { goalPeriodLabel } from "../goals/goal-helpers";

export type DayStatus = DayResponse["status"];

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  NOT_STARTED: "진행 전",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
  DEFERRED: "미룸",
  SKIPPED: "건너뜀",
};

export const DAY_PRIORITIES: readonly DayPriority[] = ["NONE", "LOW", "MEDIUM", "HIGH"];

export const DAY_PRIORITY_LABEL: Record<DayPriority, string> = { NONE: "없음", LOW: "낮음", MEDIUM: "보통", HIGH: "높음" };

/** DAY-006 Task Inbox views, the same rules as the Web Days screen. */
export const DAYS_VIEWS = ["all", "upcoming", "unplanned", "done"] as const;
export type DaysView = (typeof DAYS_VIEWS)[number];
export const DAYS_VIEW_LABEL: Record<DaysView, string> = { all: "전체", upcoming: "예정", unplanned: "미배치", done: "완료" };

export type GoalFilter = "all" | "with" | "without";
export const GOAL_FILTER_LABEL: Record<GoalFilter, string> = { all: "Goal 전체", with: "Goal 있음", without: "Goal 없음" };

export interface DaysFilters {
  view: DaysView;
  goal: GoalFilter;
  /** OR: a Day with any selected Tag matches. */
  tagIds: readonly string[];
  priority: DayPriority | "all";
}

export function emptyDaysFilters(): DaysFilters {
  return { view: "all", goal: "all", tagIds: [], priority: "all" };
}

function isFinished(day: DayResponse): boolean {
  return day.status === "DONE" || day.status === "SKIPPED";
}

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

export function filterDays(days: readonly DayResponse[], filters: DaysFilters, today: string): DayResponse[] {
  return days.filter((day) => {
    if (!matchesView(day, filters.view, today)) return false;
    if (filters.goal === "with" && day.goalId === null) return false;
    if (filters.goal === "without" && day.goalId !== null) return false;
    if (filters.priority !== "all" && day.priority !== filters.priority) return false;
    if (filters.tagIds.length > 0 && !day.tags.some((tag) => filters.tagIds.includes(tag.id))) return false;
    return true;
  });
}

export function countByView(days: readonly DayResponse[], today: string): Record<DaysView, number> {
  return {
    all: days.length,
    upcoming: days.filter((day) => matchesView(day, "upcoming", today)).length,
    unplanned: days.filter((day) => matchesView(day, "unplanned", today)).length,
    done: days.filter((day) => matchesView(day, "done", today)).length,
  };
}

/** Dated Days first (earliest first), then undated; higher priority first. */
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

/** "9/16 · 19:00–20:30", "9/16 · 시간 미정", "날짜 미정" */
export function describeDaySchedule(day: Pick<DayResponse, "plannedDate" | "schedule">): string {
  if (day.plannedDate === null) return "날짜 미정";
  const date = `${Number(day.plannedDate.slice(5, 7))}/${Number(day.plannedDate.slice(8, 10))}`;
  if (day.schedule === null) return `${date} · 시간 미정`;
  const start = wallClock(day.schedule.startAt);
  const end = wallClock(day.schedule.endAt);
  const fmt = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${date} · ${fmt(start.minutes)}–${fmt(end.minutes)}`;
}

/**
 * The Goal line under a Day title. A Day without a Goal is a normal Task (DAY-001): it gets no line,
 * never a "Goal 없음" warning.
 */
export function dayGoalLine(day: Pick<DayResponse, "goalId">, goalsById: ReadonlyMap<string, GoalResponse>): string | null {
  if (day.goalId === null) return null;
  const goal = goalsById.get(day.goalId);
  if (!goal) return null;
  return goal.kind === "PERIOD" ? `기간 · ${goal.title}` : `${goalPeriodLabel(goal)} · ${goal.title}`;
}

export interface DayFormValues {
  goalId: string;
  title: string;
  status: DayStatus;
  priority: DayPriority;
  estimatedMinutes: string;
  plannedDate: string;
  coreDay: boolean;
  tagIds: string[];
}

export function newDayValues(goalId = "", plannedDate = ""): DayFormValues {
  return { goalId, title: "", status: "NOT_STARTED", priority: "NONE", estimatedMinutes: "60", plannedDate, coreDay: false, tagIds: [] };
}

export function dayToValues(day: DayResponse): DayFormValues {
  return {
    goalId: day.goalId ?? "",
    title: day.title,
    status: day.status,
    priority: day.priority,
    estimatedMinutes: String(day.estimatedMinutes),
    plannedDate: day.plannedDate ?? "",
    coreDay: day.coreDay,
    tagIds: day.tags.map((tag) => tag.id),
  };
}

export type DayFormProblem = "title" | "minutes" | null;

export function dayFormProblem(values: DayFormValues): DayFormProblem {
  if (values.title.trim() === "") return "title";
  const minutes = Number(values.estimatedMinutes);
  if (!Number.isInteger(minutes) || minutes < 1) return "minutes";
  return null;
}

/** A Day without Goal or date sends explicit nulls (DAY-001). planningMode keeps the default. */
export function toCreateDayRequest(values: DayFormValues, planningMode: DayResponse["planningMode"] = "ANYTIME"): CreateDayRequest {
  return {
    goalId: values.goalId === "" ? null : values.goalId,
    title: values.title.trim(),
    status: values.status,
    priority: values.priority,
    estimatedMinutes: Number(values.estimatedMinutes),
    plannedDate: values.plannedDate === "" ? null : values.plannedDate,
    planningMode,
    coreDay: values.coreDay,
    tagIds: values.tagIds,
  };
}

export function toUpdateDayRequest(values: DayFormValues, day: DayResponse): UpdateDayRequest {
  return { ...toCreateDayRequest(values, day.planningMode), version: day.version };
}

export function quickAddDayRequest(title: string): CreateDayRequest {
  return toCreateDayRequest({ ...newDayValues(), title });
}

/** DONE ↔ NOT_STARTED with only status and version, so the date and schedule stay. */
export function doneToggleRequest(day: Pick<DayResponse, "status" | "version">): UpdateDayRequest {
  return { status: day.status === "DONE" ? "NOT_STARTED" : "DONE", version: day.version };
}

/** DAY-001: only WEEK Goals, and with a date only the ones containing it. */
export function weekGoalChoices(goals: readonly GoalResponse[], plannedDate: string): GoalResponse[] {
  return goals
    .filter((goal) => goal.type === "WEEK" && (plannedDate === "" || (goal.startDate <= plannedDate && plannedDate <= goal.endDate)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}