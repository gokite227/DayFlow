import type { CreateDayRequest, DayResponse, UpdateDayRequest } from "@dayflow/api-client";

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

/** Form state: date inputs use "" for "no date". */
export interface DayFormValues {
  goalId: string;
  title: string;
  status: DayStatus;
  priority: string;
  estimatedMinutes: string;
  plannedDate: string;
  planningMode: PlanningMode;
  coreDay: boolean;
}

export function newDayValues(goalId: string, plannedDate = ""): DayFormValues {
  return {
    goalId,
    title: "",
    status: "NOT_STARTED",
    priority: "1",
    estimatedMinutes: "60",
    plannedDate,
    planningMode: "ANYTIME",
    coreDay: false,
  };
}

export function dayToValues(day: DayResponse): DayFormValues {
  return {
    goalId: day.goalId,
    title: day.title,
    status: day.status,
    priority: String(day.priority),
    estimatedMinutes: String(day.estimatedMinutes),
    plannedDate: day.plannedDate ?? "",
    planningMode: day.planningMode,
    coreDay: day.coreDay,
  };
}

export function toCreateDayRequest(values: DayFormValues): CreateDayRequest {
  return {
    goalId: values.goalId,
    title: values.title,
    status: values.status,
    priority: Number(values.priority),
    estimatedMinutes: Number(values.estimatedMinutes),
    plannedDate: values.plannedDate === "" ? null : values.plannedDate,
    planningMode: values.planningMode,
    coreDay: values.coreDay,
  };
}

/** An empty date is sent as explicit null, which clears the date and removes the schedule. */
export function toUpdateDayRequest(values: DayFormValues, version: number): UpdateDayRequest {
  return { ...toCreateDayRequest(values), version };
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
