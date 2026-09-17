import type { DayResponse, EventOccurrenceResponse } from "@dayflow/api-client";
import { formatMinutes, wallClock } from "../../lib/dates";
import { categoryColors } from "../events/event-display";

/**
 * Mobile month view: the grid only hints (colored dots for Events, a count for Days); the selected date's
 * full list sits under the grid, where titles are readable on a small screen.
 */
export type MonthListItem =
  | { kind: "event"; key: string; occurrence: EventOccurrenceResponse; sortKey: string }
  | { kind: "day"; key: string; day: DayResponse; sortKey: string };

function coversDate(occurrence: EventOccurrenceResponse, date: string): boolean {
  if (occurrence.allDay) {
    return occurrence.startDate !== null && occurrence.endDateExclusive !== null && occurrence.startDate <= date && date < occurrence.endDateExclusive;
  }
  return occurrence.startAt !== null && wallClock(occurrence.startAt).date === date;
}

/** One date: all-day Events, then timed Events and Days by start time, then date-only Days (core first). */
export function monthListItems(date: string, days: readonly DayResponse[], occurrences: readonly EventOccurrenceResponse[]): MonthListItem[] {
  const events = occurrences.flatMap((occurrence, index): MonthListItem[] => {
    if (!coversDate(occurrence, date)) return [];
    const sortKey = occurrence.allDay || occurrence.startAt === null ? `0:${occurrence.title}` : `1:${formatMinutes(wallClock(occurrence.startAt).minutes)}`;
    return [{ kind: "event", key: `event:${occurrence.eventId}:${index}`, occurrence, sortKey }];
  });
  const dayItems = days.flatMap((day): MonthListItem[] => {
    if (day.schedule !== null) {
      const start = wallClock(day.schedule.startAt);
      return start.date === date ? [{ kind: "day", key: `day:${day.id}`, day, sortKey: `1:${formatMinutes(start.minutes)}` }] : [];
    }
    return day.plannedDate === date ? [{ kind: "day", key: `day:${day.id}`, day, sortKey: `2:${Number(!day.coreDay)}` }] : [];
  });
  return [...events, ...dayItems].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export interface MonthCellSummary {
  eventCount: number;
  /** Up to three distinct Category colors, for the dots under the date. */
  eventColors: string[];
  dayCount: number;
}

export function monthCellSummary(date: string, days: readonly DayResponse[], occurrences: readonly EventOccurrenceResponse[]): MonthCellSummary {
  const items = monthListItems(date, days, occurrences);
  const colors: string[] = [];
  for (const item of items) {
    if (item.kind !== "event") continue;
    const { color } = categoryColors(item.occurrence.category);
    if (!colors.includes(color) && colors.length < 3) colors.push(color);
  }
  return {
    eventCount: items.filter((item) => item.kind === "event").length,
    eventColors: colors,
    dayCount: items.filter((item) => item.kind === "day").length,
  };
}

/** Whether any Event touches the month itself (for "이 달에 일정이 없어요."). */
export function hasEventsInMonth(occurrences: readonly EventOccurrenceResponse[], start: string, end: string): boolean {
  return occurrences.some((occurrence) => {
    if (occurrence.allDay) return occurrence.startDate !== null && occurrence.endDateExclusive !== null && occurrence.startDate <= end && occurrence.endDateExclusive > start;
    if (occurrence.startAt === null) return false;
    const date = wallClock(occurrence.startAt).date;
    return start <= date && date <= end;
  });
}

/** Empty wording of the selected date's list. */
export function monthListEmptyMessage(content: "all" | "events"): string {
  return content === "events" ? "이 날짜에 일정이 없어요." : "이 날짜에 Day와 일정이 없어요.";
}
