import type { DayResponse, EventOccurrenceResponse } from "@dayflow/api-client";
import { matchesCategoryFilter, type EventCategoryFilter } from "../events/event-category-values";
import { eventTime, occurrenceDate } from "../events/event-values";
import type { CalendarContent } from "./calendar-range";
import { formatMinutes, wallClock } from "./calendar-time";

/** The URL `category` value as the Events screen filter; null means every Event. */
export function categoryFilterFromParam(category: string | null): EventCategoryFilter {
  if (category === null) return "ALL";
  return category === "UNCATEGORIZED" ? "UNCATEGORIZED" : { categoryId: category };
}

/**
 * What the Calendar draws. "일정만" removes the Days from the data itself (not only from the screen), so no
 * hidden Day can be dragged, dropped on, resized or take part in the overlap layout. The Category filter only
 * ever narrows Events; Days are never hidden by it.
 */
export function calendarContentItems(
  days: readonly DayResponse[],
  occurrences: readonly EventOccurrenceResponse[],
  content: CalendarContent,
  category: string | null,
): { days: DayResponse[]; occurrences: EventOccurrenceResponse[] } {
  const filter = categoryFilterFromParam(category);
  return {
    days: content === "events" ? [] : [...days],
    occurrences: occurrences.filter((occurrence) => matchesCategoryFilter(occurrence.category, filter)),
  };
}

export type MonthItem =
  | { kind: "event"; key: string; occurrence: EventOccurrenceResponse; timeLabel: string | null; sortKey: string }
  | { kind: "day"; key: string; day: DayResponse; timeLabel: string | null; sortKey: string };

/** Items a month cell shows at most; the rest are behind "+N 더보기". */
export const MONTH_CELL_LIMIT = 3;

/**
 * One date of the month grid: all-day Events (on every date they cover), then timed Events and Days by start
 * time, then date-only Days. Timed items show "14:00"; all-day Events and date-only Days show no time.
 */
export function monthItemsOn(date: string, days: readonly DayResponse[], occurrences: readonly EventOccurrenceResponse[]): MonthItem[] {
  const events = occurrences.flatMap((occurrence, index): MonthItem[] => {
    const time = eventTime(occurrence);
    if (time.allDay) {
      return time.startDate <= date && date < time.endDateExclusive
        ? [{ kind: "event", key: `event:${occurrence.eventId}:${index}`, occurrence, timeLabel: null, sortKey: `0:${occurrence.title}` }]
        : [];
    }
    if (occurrenceDate(occurrence) !== date) return [];
    const minutes = wallClock(time.startAt).minutes;
    return [{ kind: "event", key: `event:${occurrence.eventId}:${index}`, occurrence, timeLabel: formatMinutes(minutes), sortKey: `1:${formatMinutes(minutes)}` }];
  });
  const dayItems = days.flatMap((day): MonthItem[] => {
    if (day.schedule !== null) {
      const start = wallClock(day.schedule.startAt);
      return start.date === date
        ? [{ kind: "day", key: `day:${day.id}`, day, timeLabel: formatMinutes(start.minutes), sortKey: `1:${formatMinutes(start.minutes)}` }]
        : [];
    }
    return day.plannedDate === date ? [{ kind: "day", key: `day:${day.id}`, day, timeLabel: null, sortKey: `2:${Number(!day.coreDay)}` }] : [];
  });
  return [...events, ...dayItems].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

/** The visible items of a cell and how many more there are. */
export function monthCellItems(items: readonly MonthItem[], limit = MONTH_CELL_LIMIT): { shown: MonthItem[]; hidden: number } {
  return { shown: items.slice(0, limit), hidden: Math.max(items.length - limit, 0) };
}

/** Whether any Event of the month grid falls inside the month itself (for "이 달에 일정이 없어요."). */
export function hasEventsInMonth(occurrences: readonly EventOccurrenceResponse[], monthStart: string, monthEnd: string): boolean {
  return occurrences.some((occurrence) => {
    const time = eventTime(occurrence);
    if (time.allDay) return time.startDate <= monthEnd && time.endDateExclusive > monthStart;
    const date = occurrenceDate(occurrence);
    return monthStart <= date && date <= monthEnd;
  });
}
