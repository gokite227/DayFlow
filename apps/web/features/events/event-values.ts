import type {
  CreateEventRequest,
  EventOccurrenceResponse,
  EventRecurrence,
  EventResponse,
  EventTime,
  EventType,
  UpdateEventRequest,
} from "@dayflow/api-client";
import { addDays, browserTimeZone, formatMinutes, wallClock, weekdayShort } from "../calendar/calendar-time";

export const EVENT_TYPES: readonly EventType[] = ["BIRTHDAY", "INTERVIEW", "EXAM", "DEADLINE", "APPOINTMENT", "OTHER"];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  BIRTHDAY: "생일",
  INTERVIEW: "면접",
  EXAM: "시험",
  DEADLINE: "마감",
  APPOINTMENT: "약속",
  OTHER: "기타",
};

export const RECURRENCE_LABEL: Record<EventRecurrence, string> = {
  NONE: "반복 안 함",
  DAILY: "매일",
  WEEKLY: "매주",
  MONTHLY: "매월",
  YEARLY: "매년",
};

/** NOTI-001 limits and presets (minutes before the occurrence start). */
export const MAX_REMINDERS = 5;
export const MAX_REMINDER_OFFSET_MINUTES = 43_200;
export const REMINDER_PRESETS: readonly number[] = [0, 10, 30, 60, 1440];

export function reminderLabel(offset: number): string {
  if (offset === 0) return "정각";
  if (offset % 1440 === 0) return `${offset / 1440}일 전`;
  if (offset % 60 === 0) return `${offset / 60}시간 전`;
  return `${offset}분 전`;
}

/**
 * The server always sends exactly one time pair (requirements §8.4). Narrowing here keeps the
 * rest of the UI free of null checks and surfaces a broken response instead of rendering it.
 */
export function eventTime(value: Pick<EventResponse, "allDay" | "startAt" | "endAt" | "startDate" | "endDateExclusive">): EventTime {
  if (value.allDay && value.startDate !== null && value.endDateExclusive !== null) {
    return { allDay: true, startAt: null, endAt: null, startDate: value.startDate, endDateExclusive: value.endDateExclusive };
  }
  if (!value.allDay && value.startAt !== null && value.endAt !== null) {
    return { allDay: false, startAt: value.startAt, endAt: value.endAt, startDate: null, endDateExclusive: null };
  }
  throw new Error("Event time fields do not match allDay.");
}

/** "9/30 (WED)" */
export function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} (${weekdayShort(date)})`;
}

/** Human-readable time of an occurrence, in the Event timezone wall clock. */
export function describeOccurrenceTime(occurrence: EventOccurrenceResponse): string {
  const time = eventTime(occurrence);
  if (time.allDay) {
    const last = addDays(time.endDateExclusive, -1);
    return last === time.startDate ? `${shortDate(time.startDate)} · 하루 종일` : `${shortDate(time.startDate)} ~ ${shortDate(last)} · 하루 종일`;
  }
  const start = wallClock(time.startAt);
  const end = wallClock(time.endAt);
  if (time.startAt === time.endAt) return `${shortDate(start.date)} · ${formatMinutes(start.minutes)}`;
  return end.date === start.date
    ? `${shortDate(start.date)} · ${formatMinutes(start.minutes)}–${formatMinutes(end.minutes)}`
    : `${shortDate(start.date)} ${formatMinutes(start.minutes)} ~ ${shortDate(end.date)} ${formatMinutes(end.minutes)}`;
}

/** The first date an occurrence touches (for grouping and sorting). */
export function occurrenceDate(occurrence: EventOccurrenceResponse): string {
  const time = eventTime(occurrence);
  return time.allDay ? time.startDate : wallClock(time.startAt).date;
}

/** One row per Event: its first occurrence in the (already sorted) list. */
export function nextOccurrences(occurrences: readonly EventOccurrenceResponse[]): EventOccurrenceResponse[] {
  const seen = new Set<string>();
  return occurrences.filter((occurrence) => {
    if (seen.has(occurrence.eventId)) return false;
    seen.add(occurrence.eventId);
    return true;
  });
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Offset (minutes east of UTC) of a timezone at a UTC instant, via Intl. */
export function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60_000);
}

/** "2026-09-30T23:59:00+09:00": a wall-clock date and time in `timeZone` with that zone's offset. */
export function zonedDateTime(date: string, time: string, timeZone: string): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset around DST changes.
  let offset = zoneOffsetMinutes(wall, timeZone);
  offset = zoneOffsetMinutes(wall - offset * 60_000, timeZone);
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  return `${date}T${pad(hour)}:${pad(minute)}:00${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export interface EventFormValues {
  title: string;
  type: EventType;
  allDay: boolean;
  startDate: string;
  startTime: string;
  /** Timed: end date. All-day: the last day (inclusive in the form, exclusive in the API). */
  endDate: string;
  endTime: string;
  timezone: string;
  location: string;
  notes: string;
  recurrence: EventRecurrence;
  reminders: number[];
  linkedGoalId: string;
}

export function newEventValues(date: string, timezone = browserTimeZone()): EventFormValues {
  return {
    title: "",
    type: "APPOINTMENT",
    allDay: false,
    startDate: date,
    startTime: "09:00",
    endDate: date,
    endTime: "10:00",
    timezone,
    location: "",
    notes: "",
    recurrence: "NONE",
    reminders: [],
    linkedGoalId: "",
  };
}

export function eventToValues(event: EventResponse): EventFormValues {
  const time = eventTime(event);
  const base = { ...newEventValues("", event.timezone) };
  const shared = {
    title: event.title,
    type: event.type,
    timezone: event.timezone,
    location: event.location ?? "",
    notes: event.notes ?? "",
    recurrence: event.recurrence,
    reminders: [...event.reminders],
    linkedGoalId: event.linkedGoalId ?? "",
  };
  if (time.allDay) {
    return { ...base, ...shared, allDay: true, startDate: time.startDate, endDate: addDays(time.endDateExclusive, -1) };
  }
  return {
    ...base,
    ...shared,
    allDay: false,
    startDate: time.startAt.slice(0, 10),
    startTime: time.startAt.slice(11, 16),
    endDate: time.endAt.slice(0, 10),
    endTime: time.endAt.slice(11, 16),
  };
}

export type EventFormProblem = "timezone" | "endBeforeStart" | "reminders" | null;

export function eventFormProblem(values: EventFormValues): EventFormProblem {
  if (!isValidTimeZone(values.timezone)) return "timezone";
  if (values.allDay ? values.endDate < values.startDate : `${values.endDate}T${values.endTime}` < `${values.startDate}T${values.startTime}`) {
    return "endBeforeStart";
  }
  if (values.reminders.length > MAX_REMINDERS || new Set(values.reminders).size !== values.reminders.length) {
    return "reminders";
  }
  return null;
}

function timeFields(values: EventFormValues) {
  return values.allDay
    ? { allDay: true, startDate: values.startDate, endDateExclusive: addDays(values.endDate, 1) }
    : {
        allDay: false,
        startAt: zonedDateTime(values.startDate, values.startTime, values.timezone),
        endAt: zonedDateTime(values.endDate, values.endTime, values.timezone),
      };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export function toCreateEventRequest(values: EventFormValues): CreateEventRequest {
  return {
    title: values.title.trim(),
    type: values.type,
    ...timeFields(values),
    timezone: values.timezone,
    location: orNull(values.location),
    notes: orNull(values.notes),
    recurrence: values.recurrence,
    reminders: [...values.reminders].sort((a, b) => a - b),
    linkedGoalId: orNull(values.linkedGoalId),
  };
}

/** Sends the whole form; the time pair of the other kind is omitted and dropped by the server. */
export function toUpdateEventRequest(values: EventFormValues, version: number): UpdateEventRequest {
  return { ...toCreateEventRequest(values), version };
}
