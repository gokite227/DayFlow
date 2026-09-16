import type {
  CreateEventRequest,
  EventCategoryResponse,
  EventCategorySummary,
  EventOccurrenceResponse,
  EventRecurrence,
  EventResponse,
  EventTime,
  UpdateEventRequest,
} from "@dayflow/api-client";
import { eventCategoryColors, uncategorizedEventColor } from "@dayflow/design-tokens";
import { formatOffsetDateTime, zonedDateTimeToInstant } from "@dayflow/domain";
import { addDays, isValidTimeZone, koreanShortDate, koreanTime, wallClock } from "../../lib/dates";

export const RECURRENCE_LABEL: Record<EventRecurrence, string> = {
  NONE: "반복 안 함",
  DAILY: "매일",
  WEEKLY: "매주",
  MONTHLY: "매월",
  YEARLY: "매년",
};

export const RECURRENCES = Object.keys(RECURRENCE_LABEL) as EventRecurrence[];

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

export const UNCATEGORIZED_LABEL = "미분류";

export function categoryLabel(category: EventCategorySummary | null): string {
  return category?.name ?? UNCATEGORIZED_LABEL;
}

/** Category bar/background colors; uncategorized Events are neutral (EVT-006). */
export function categoryColors(category: EventCategorySummary | null): { color: string; soft: string } {
  if (!category) return { color: uncategorizedEventColor.value, soft: uncategorizedEventColor.soft };
  const soft = eventCategoryColors.find((entry) => entry.value === category.color)?.soft ?? "#f3f1f3";
  return { color: category.color, soft };
}

export function sortCategories(categories: readonly EventCategoryResponse[]): EventCategoryResponse[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export type CategoryFilter = "ALL" | "UNCATEGORIZED" | { categoryId: string };

export function matchesCategoryFilter(category: EventCategorySummary | null, filter: CategoryFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "UNCATEGORIZED") return category === null;
  return category?.id === filter.categoryId;
}

/** Narrows the independent nullable time fields; the server always sends exactly one pair (§8.4). */
export function eventTime(value: Pick<EventResponse, "allDay" | "startAt" | "endAt" | "startDate" | "endDateExclusive">): EventTime {
  if (value.allDay && value.startDate !== null && value.endDateExclusive !== null) {
    return { allDay: true, startAt: null, endAt: null, startDate: value.startDate, endDateExclusive: value.endDateExclusive };
  }
  if (!value.allDay && value.startAt !== null && value.endAt !== null) {
    return { allDay: false, startAt: value.startAt, endAt: value.endAt, startDate: null, endDateExclusive: null };
  }
  throw new Error("Event time fields do not match allDay.");
}

/** "9월 20일 (일) · 하루 종일", "9월 20일 (일) · 오후 2:00–오후 3:00" in the Event's wall clock. */
export function describeOccurrenceTime(value: Pick<EventOccurrenceResponse, "allDay" | "startAt" | "endAt" | "startDate" | "endDateExclusive">): string {
  const time = eventTime(value);
  if (time.allDay) {
    const last = addDays(time.endDateExclusive, -1);
    return last === time.startDate
      ? `${koreanShortDate(time.startDate)} · 하루 종일`
      : `${koreanShortDate(time.startDate)} ~ ${koreanShortDate(last)} · 하루 종일`;
  }
  const start = wallClock(time.startAt);
  const end = wallClock(time.endAt);
  if (time.startAt === time.endAt) return `${koreanShortDate(start.date)} · ${koreanTime(start.minutes)}`;
  return end.date === start.date
    ? `${koreanShortDate(start.date)} · ${koreanTime(start.minutes)}–${koreanTime(end.minutes)}`
    : `${koreanShortDate(start.date)} ${koreanTime(start.minutes)} ~ ${koreanShortDate(end.date)} ${koreanTime(end.minutes)}`;
}

/** Recurrence and reminders in one short line, e.g. "매주 · 알림 10분 전, 1시간 전". */
export function describeEventExtras(event: Pick<EventResponse, "recurrence" | "reminders">): string | null {
  const parts = [
    event.recurrence !== "NONE" ? RECURRENCE_LABEL[event.recurrence] : null,
    event.reminders.length > 0 ? `알림 ${[...event.reminders].sort((a, b) => a - b).map(reminderLabel).join(", ")}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The first date an occurrence touches, in the Event's calendar. */
export function occurrenceDate(occurrence: Pick<EventOccurrenceResponse, "allDay" | "startAt" | "endAt" | "startDate" | "endDateExclusive">): string {
  const time = eventTime(occurrence);
  return time.allDay ? time.startDate : wallClock(time.startAt).date;
}

/** One row per Event: its first occurrence in the (already sorted) list. */
export function nextOccurrences<T extends Pick<EventOccurrenceResponse, "eventId">>(occurrences: readonly T[]): T[] {
  const seen = new Set<string>();
  return occurrences.filter((occurrence) => {
    if (seen.has(occurrence.eventId)) return false;
    seen.add(occurrence.eventId);
    return true;
  });
}

/** The occurrence a notification or list row points to, when it is still part of the Event. */
export function findOccurrence(occurrences: readonly EventOccurrenceResponse[], eventId: string, occurrenceStartAt: string | undefined) {
  if (!occurrenceStartAt) return undefined;
  const target = Date.parse(occurrenceStartAt);
  return occurrences.find(
    (occurrence) =>
      occurrence.eventId === eventId &&
      (occurrence.startDate === occurrenceStartAt || (occurrence.startAt !== null && Date.parse(occurrence.startAt) === target)),
  );
}

/** "2026-09-30T23:59:00+09:00" for a wall-clock date and time in `timeZone`. */
export function zonedDateTime(date: string, time: string, timeZone: string): string {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const instant = zonedDateTimeToInstant(
    { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)), hour, minute, second: 0, millisecond: 0 },
    timeZone,
  );
  return formatOffsetDateTime(instant, timeZone);
}

export interface EventFormValues {
  title: string;
  /** "" = 미분류 */
  categoryId: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  /** Timed: end date. All-day: the last day (inclusive here, exclusive in the API). */
  endDate: string;
  endTime: string;
  timezone: string;
  location: string;
  notes: string;
  recurrence: EventRecurrence;
  reminders: number[];
  linkedGoalId: string;
}

export function newEventValues(date: string, timezone: string): EventFormValues {
  return {
    title: "",
    categoryId: "",
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
  const shared = {
    ...newEventValues("", event.timezone),
    title: event.title,
    categoryId: event.category?.id ?? "",
    location: event.location ?? "",
    notes: event.notes ?? "",
    recurrence: event.recurrence,
    reminders: [...event.reminders].sort((a, b) => a - b),
    linkedGoalId: event.linkedGoalId ?? "",
  };
  if (time.allDay) {
    return { ...shared, allDay: true, startDate: time.startDate, endDate: addDays(time.endDateExclusive, -1) };
  }
  return {
    ...shared,
    allDay: false,
    startDate: time.startAt.slice(0, 10),
    startTime: time.startAt.slice(11, 16),
    endDate: time.endAt.slice(0, 10),
    endTime: time.endAt.slice(11, 16),
  };
}

export type EventFormProblem = "title" | "timezone" | "endBeforeStart" | "reminders" | null;

export function eventFormProblem(values: EventFormValues): EventFormProblem {
  if (values.title.trim() === "") return "title";
  if (!isValidTimeZone(values.timezone)) return "timezone";
  if (values.allDay ? values.endDate < values.startDate : `${values.endDate}T${values.endTime}` < `${values.startDate}T${values.startTime}`) {
    return "endBeforeStart";
  }
  if (values.reminders.length > MAX_REMINDERS || new Set(values.reminders).size !== values.reminders.length) return "reminders";
  return null;
}

export const EVENT_FORM_PROBLEM_MESSAGE: Record<Exclude<EventFormProblem, null>, string> = {
  title: "제목을 입력해주세요.",
  timezone: "올바른 IANA timezone을 입력해주세요. 예: Asia/Seoul",
  endBeforeStart: "종료가 시작보다 빠를 수 없어요.",
  reminders: `알림은 서로 다른 시간으로 최대 ${MAX_REMINDERS}개까지 설정할 수 있어요.`,
};

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export function toCreateEventRequest(values: EventFormValues): CreateEventRequest {
  const time = values.allDay
    ? { allDay: true, startDate: values.startDate, endDateExclusive: addDays(values.endDate, 1) }
    : {
        allDay: false,
        startAt: zonedDateTime(values.startDate, values.startTime, values.timezone),
        endAt: zonedDateTime(values.endDate, values.endTime, values.timezone),
      };
  return {
    title: values.title.trim(),
    categoryId: orNull(values.categoryId),
    ...time,
    timezone: values.timezone,
    location: orNull(values.location),
    notes: orNull(values.notes),
    recurrence: values.recurrence,
    reminders: [...values.reminders].sort((a, b) => a - b),
    linkedGoalId: orNull(values.linkedGoalId),
  };
}

/** The whole form with version; null categoryId/location/notes/linkedGoalId clear those fields. */
export function toUpdateEventRequest(values: EventFormValues, version: number): UpdateEventRequest {
  return { ...toCreateEventRequest(values), version };
}

export function toggleReminder(reminders: readonly number[], offset: number): number[] {
  return reminders.includes(offset) ? reminders.filter((current) => current !== offset) : [...reminders, offset].sort((a, b) => a - b);
}