import type { DayResponse } from "@dayflow/api-client";
import { formatMinutes, koreanTime, wallClock } from "../../lib/dates";

/**
 * Day detail editor: the Day's time placement (DaySchedule) with minute precision, like the Web detail. There is no
 * 15-minute rule here; only Calendar drag / resize snaps. Times are the schedule's own wall clock ("HH:mm"), and
 * "24:00" is the end of the day (a schedule ending at midnight).
 */
export interface ScheduleFormValues {
  enabled: boolean;
  start: string;
  end: string;
}

export const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_START = 9 * 60;

/** "HH:mm" (00:00–24:00) → minutes of the day, or null. */
export function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[2]) < 60 && minutes <= MINUTES_PER_DAY ? minutes : null;
}

export function timeValue(minutes: number): string {
  return minutes >= MINUTES_PER_DAY ? "24:00" : formatMinutes(minutes);
}

/** "오후 8:27", and "자정" for the end of the day. */
export function timeLabel(value: string): string {
  const minutes = parseTime(value);
  if (minutes === null) return value;
  return minutes === MINUTES_PER_DAY ? "자정 (24:00)" : koreanTime(minutes);
}

/** The exact stored times (20:27 stays 20:27); a Day without a schedule starts from 09:00 + its estimate. */
export function scheduleFormValues(day: Pick<DayResponse, "schedule" | "estimatedMinutes"> | null, estimatedMinutes = 60): ScheduleFormValues {
  const schedule = day?.schedule ?? null;
  if (schedule) {
    const start = wallClock(schedule.startAt).minutes;
    const length = Math.round((Date.parse(schedule.endAt) - Date.parse(schedule.startAt)) / 60_000);
    return { enabled: true, start: formatMinutes(start), end: timeValue(Math.min(start + length, MINUTES_PER_DAY)) };
  }
  const length = Math.max(day?.estimatedMinutes ?? estimatedMinutes, 1);
  return { enabled: false, start: formatMinutes(DEFAULT_START), end: timeValue(Math.min(DEFAULT_START + length, MINUTES_PER_DAY)) };
}

export type ScheduleFormProblem = "needsDate" | "invalid" | "endBeforeStart" | null;

/** Same rules as the server: a date, and an end after the start. Any minute is fine (08:01–08:06). */
export function scheduleFormProblem(values: ScheduleFormValues, plannedDate: string): ScheduleFormProblem {
  if (!values.enabled) return null;
  if (plannedDate === "") return "needsDate";
  const start = parseTime(values.start);
  const end = parseTime(values.end);
  if (start === null || end === null || start >= MINUTES_PER_DAY) return "invalid";
  return end > start ? null : "endBeforeStart";
}

export const SCHEDULE_FORM_PROBLEM_MESSAGE: Record<Exclude<ScheduleFormProblem, null>, string> = {
  needsDate: "시간을 정하려면 실행 날짜를 먼저 골라주세요.",
  invalid: "시작/종료 시간을 다시 골라주세요.",
  endBeforeStart: "종료 시간은 시작 시간보다 뒤여야 해요.",
};

export type SchedulePlan = { type: "none" } | { type: "set"; date: string; startMinutes: number; lengthMinutes: number } | { type: "remove" };

/**
 * What saving the form does to the schedule. Nothing is sent unless the time placement itself changed: editing only
 * the title (or only the date, which the server moves with the same times) never rewrites 20:27 as anything else.
 */
export function planScheduleSave(
  day: Pick<DayResponse, "schedule"> | null,
  initial: ScheduleFormValues,
  values: ScheduleFormValues,
  plannedDate: string,
): SchedulePlan {
  const hasSchedule = Boolean(day?.schedule);
  // Clearing the date also clears the schedule on the server.
  if (plannedDate === "") return { type: "none" };
  if (!values.enabled) return hasSchedule ? { type: "remove" } : { type: "none" };
  if (scheduleFormProblem(values, plannedDate) !== null) return { type: "none" };
  if (hasSchedule && values.start === initial.start && values.end === initial.end) return { type: "none" };
  const startMinutes = parseTime(values.start)!;
  return { type: "set", date: plannedDate, startMinutes, lengthMinutes: parseTime(values.end)! - startMinutes };
}
