import type { CreateDayRequest, DayPriority, DayResponse, UpdateDayRequest } from "@dayflow/api-client";

export type DayStatus = DayResponse["status"];
export type PlanningMode = DayResponse["planningMode"];

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  NOT_STARTED: "진행 전",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
  DEFERRED: "미룸",
  SKIPPED: "건너뜀",
};

/** requirements §4.1 planning types. */
export const PLANNING_MODE_LABEL: Record<PlanningMode, string> = {
  FIXED: "고정 일정",
  WINDOW: "시간대 목표",
  ANYTIME: "오늘 안에",
};

/** DAY-004 task priority, in order. Independent of coreDay ("오늘의 핵심 Day"). */
export const DAY_PRIORITIES: readonly DayPriority[] = ["NONE", "LOW", "MEDIUM", "HIGH"];

export const DAY_PRIORITY_LABEL: Record<DayPriority, string> = {
  NONE: "없음",
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
};

/** Form state: selects use "" for "no Goal" and date inputs "" for "no date". */
export interface DayFormValues {
  goalId: string;
  title: string;
  status: DayStatus;
  priority: DayPriority;
  estimatedMinutes: string;
  plannedDate: string;
  planningMode: PlanningMode;
  coreDay: boolean;
  tagIds: string[];
}

export function newDayValues(goalId = "", plannedDate = ""): DayFormValues {
  return {
    goalId,
    title: "",
    status: "NOT_STARTED",
    priority: "NONE",
    estimatedMinutes: "60",
    plannedDate,
    planningMode: "ANYTIME",
    coreDay: false,
    tagIds: [],
  };
}

export function dayToValues(day: DayResponse): DayFormValues {
  return {
    goalId: day.goalId ?? "",
    title: day.title,
    status: day.status,
    priority: day.priority,
    estimatedMinutes: String(day.estimatedMinutes),
    plannedDate: day.plannedDate ?? "",
    planningMode: day.planningMode,
    coreDay: day.coreDay,
    tagIds: day.tags.map((tag) => tag.id),
  };
}

/** An empty Goal or date is sent as explicit null: a Day may have neither (DAY-001). */
export function toCreateDayRequest(values: DayFormValues): CreateDayRequest {
  return {
    goalId: values.goalId === "" ? null : values.goalId,
    title: values.title,
    status: values.status,
    priority: values.priority,
    estimatedMinutes: Number(values.estimatedMinutes),
    plannedDate: values.plannedDate === "" ? null : values.plannedDate,
    planningMode: values.planningMode,
    coreDay: values.coreDay,
    tagIds: values.tagIds,
  };
}

/** Sends every field, so clearing the Goal, the date or the Tags is explicit. */
export function toUpdateDayRequest(values: DayFormValues, version: number): UpdateDayRequest {
  return { ...toCreateDayRequest(values), version };
}

/** DAY-006 Backlog quick add: a title is enough, everything else keeps its default. */
export function quickAddDayRequest(title: string): CreateDayRequest {
  return toCreateDayRequest({ ...newDayValues(), title });
}

/** Toggles DONE ↔ NOT_STARTED; only status and version are sent so the date and schedule stay as they are. */
export function doneToggleRequest(day: Pick<DayResponse, "status" | "version">): UpdateDayRequest {
  return { status: day.status === "DONE" ? "NOT_STARTED" : "DONE", version: day.version };
}

/** "2026-09-15 · 19:00 ~ 20:30", "2026-09-15 · 시간 미정" or "날짜 미정". */
export function describeDaySchedule(day: Pick<DayResponse, "plannedDate" | "schedule">): string {
  if (day.plannedDate === null) return "날짜 미정";
  if (day.schedule === null) return `${day.plannedDate} · 시간 미정`;
  // startAt/endAt carry the schedule timezone offset, so their wall-clock part is local time.
  return `${day.plannedDate} · ${day.schedule.startAt.slice(11, 16)} ~ ${day.schedule.endAt.slice(11, 16)}`;
}
