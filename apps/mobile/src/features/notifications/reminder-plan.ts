import type { EventOccurrenceResponse, EventResponse } from "@dayflow/api-client";
import { getZonedDateTimeParts, zonedDateTimeToInstant } from "@dayflow/domain";
import { WEEKDAYS_KR, addDays, daysBetween, koreanTime, wallClock, weekdayIndex } from "../../lib/dates";

/**
 * NOTI-001 local notification planning. Pure: given the Events (reminder offsets), their computed
 * occurrences from GET /event-occurrences and "now", it returns every notification that should be
 * pending on the device. The native adapter only schedules and cancels what reconcile-plan decides.
 */

/**
 * Rolling window. Recurring Events are expanded only this far ahead; the app fills the window again on
 * launch, on foreground and after Event changes (requirements §11.3).
 */
export const REMINDER_WINDOW_DAYS = 30;

/**
 * iOS keeps at most 64 pending local notifications per app and silently drops the rest. Event reminders
 * take at most 48 (the soonest first), leaving room for Day nudges planned for the Focus/Nudge phase.
 */
export const MAX_EVENT_REMINDER_NOTIFICATIONS = 48;

/** All-day Events are reminded relative to 09:00 of the occurrence date in the Event timezone (§8.4). */
export const ALL_DAY_REMINDER_MINUTES = 9 * 60;

export const NOTIFICATION_TITLE = "DayFlow";
export const EVENT_REMINDER_ID_PREFIX = "dayflow.event-reminder.";

type OccurrenceInput = Pick<EventOccurrenceResponse, "eventId" | "allDay" | "startAt" | "startDate" | "timezone" | "title">;
type EventInput = Pick<EventResponse, "id" | "reminders">;

export interface PlannedReminder {
  /** Deterministic: the same Event, occurrence and offset always map to the same notification. */
  identifier: string;
  eventId: string;
  /** The occurrence start as the API sent it: offset date-time (timed) or local date (all-day). */
  occurrenceStartAt: string;
  offsetMinutes: number;
  triggerAt: number;
  title: string;
  body: string;
  deepLink: string;
  /** Changes whenever what the user would see or when it fires changes, so reconcile replaces it. */
  fingerprint: string;
}

/** The instant a reminder fires, or null when the occurrence has no usable start. */
export function reminderTriggerAt(occurrence: OccurrenceInput, offsetMinutes: number): number | null {
  if (!occurrence.allDay) {
    // startAt already carries the Event timezone offset: parsing it gives the exact instant.
    const start = occurrence.startAt === null ? Number.NaN : Date.parse(occurrence.startAt);
    return Number.isNaN(start) ? null : start - offsetMinutes * 60_000;
  }
  if (occurrence.startDate === null) return null;
  // Wall-clock arithmetic in the Event timezone: "1일 전" stays "전날 09:00" even across a DST change.
  const wallMinutes = ALL_DAY_REMINDER_MINUTES - offsetMinutes;
  const dayShift = Math.floor(wallMinutes / 1440);
  const minuteOfDay = wallMinutes - dayShift * 1440;
  const date = addDays(occurrence.startDate, dayShift);
  return zonedDateTimeToInstant(
    {
      year: Number(date.slice(0, 4)),
      month: Number(date.slice(5, 7)),
      day: Number(date.slice(8, 10)),
      hour: Math.floor(minuteOfDay / 60),
      minute: minuteOfDay % 60,
      second: 0,
      millisecond: 0,
    },
    occurrence.timezone,
  );
}

function occurrenceKey(occurrence: OccurrenceInput): string | null {
  if (occurrence.allDay) return occurrence.startDate === null ? null : `d${occurrence.startDate.replaceAll("-", "")}`;
  if (occurrence.startAt === null) return null;
  const start = Date.parse(occurrence.startAt);
  return Number.isNaN(start) ? null : `t${start}`;
}

export function reminderIdentifier(eventId: string, occurrence: OccurrenceInput, offsetMinutes: number): string | null {
  const key = occurrenceKey(occurrence);
  return key === null ? null : `${EVENT_REMINDER_ID_PREFIX}${eventId}.${key}.${offsetMinutes}`;
}

export function isEventReminderIdentifier(identifier: string): boolean {
  return identifier.startsWith(EVENT_REMINDER_ID_PREFIX);
}

function localDateInZone(instant: number, timezone: string): string {
  const parts = getZonedDateTimeParts(instant, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function relativeDayLabel(eventDate: string, fireDate: string): string {
  const days = daysBetween(fireDate, eventDate);
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  return `${Number(eventDate.slice(5, 7))}월 ${Number(eventDate.slice(8, 10))}일 (${WEEKDAYS_KR[weekdayIndex(eventDate)]})`;
}

/**
 * "오후 2:00 · 면접", "내일 오후 2:00 · 면접", "내일 · 포트폴리오 제출 마감". Only the title and time:
 * location and notes stay out of the lock screen. Times are the Event's own wall clock.
 */
export function reminderBody(occurrence: OccurrenceInput, triggerAt: number): string {
  if (occurrence.allDay) {
    const date = occurrence.startDate ?? "";
    return `${relativeDayLabel(date, localDateInZone(triggerAt, occurrence.timezone))} · ${occurrence.title}`;
  }
  const start = wallClock(occurrence.startAt ?? "");
  const day = relativeDayLabel(start.date, localDateInZone(triggerAt, occurrence.timezone));
  const time = koreanTime(start.minutes);
  return `${day === "오늘" ? time : `${day} ${time}`} · ${occurrence.title}`;
}

export function eventDeepLink(eventId: string, occurrenceStartAt: string): string {
  return `dayflow://events/${encodeURIComponent(eventId)}?occurrence=${encodeURIComponent(occurrenceStartAt)}`;
}

export interface PlanOptions {
  now: number;
  windowDays?: number;
  maxCount?: number;
}

/**
 * Every reminder that should be pending: future triggers inside the rolling window, one per
 * (Event, occurrence, offset), soonest first and capped for the OS limit.
 */
export function planEventReminders(
  events: readonly EventInput[],
  occurrences: readonly OccurrenceInput[],
  { now, windowDays = REMINDER_WINDOW_DAYS, maxCount = MAX_EVENT_REMINDER_NOTIFICATIONS }: PlanOptions,
): PlannedReminder[] {
  const remindersByEvent = new Map(events.map((event) => [event.id, [...new Set(event.reminders)]]));
  const windowEnd = now + windowDays * 86_400_000;
  const planned = new Map<string, PlannedReminder>();

  for (const occurrence of occurrences) {
    const occurrenceStartAt = occurrence.allDay ? occurrence.startDate : occurrence.startAt;
    if (occurrenceStartAt === null) continue;
    for (const offsetMinutes of remindersByEvent.get(occurrence.eventId) ?? []) {
      const triggerAt = reminderTriggerAt(occurrence, offsetMinutes);
      const identifier = reminderIdentifier(occurrence.eventId, occurrence, offsetMinutes);
      // A reminder whose time has passed is never scheduled (it would fire immediately).
      if (triggerAt === null || identifier === null || triggerAt <= now || triggerAt > windowEnd) continue;
      if (planned.has(identifier)) continue;
      const body = reminderBody(occurrence, triggerAt);
      const deepLink = eventDeepLink(occurrence.eventId, occurrenceStartAt);
      planned.set(identifier, {
        identifier,
        eventId: occurrence.eventId,
        occurrenceStartAt,
        offsetMinutes,
        triggerAt,
        title: NOTIFICATION_TITLE,
        body,
        deepLink,
        fingerprint: `${triggerAt}|${NOTIFICATION_TITLE}|${body}|${deepLink}`,
      });
    }
  }

  return [...planned.values()]
    .sort((a, b) => a.triggerAt - b.triggerAt || a.identifier.localeCompare(b.identifier))
    .slice(0, maxCount);
}

/** NOTI-001 custom reminders go up to 30 days (43,200 minutes) before the occurrence. */
export const MAX_REMINDER_OFFSET_DAYS = 30;

/**
 * The /event-occurrences range that covers the window. A reminder firing inside the window can belong
 * to an occurrence up to the largest offset later, so the range extends past the window by that much.
 * The API reads from/to as dates in each Event's own timezone; one day of padding on both sides covers
 * any timezone difference with the device, and planEventReminders then keeps only the exact window.
 */
export function occurrenceFetchRange(deviceToday: string, windowDays = REMINDER_WINDOW_DAYS): { from: string; to: string } {
  return { from: addDays(deviceToday, -1), to: addDays(deviceToday, windowDays + MAX_REMINDER_OFFSET_DAYS + 2) };
}