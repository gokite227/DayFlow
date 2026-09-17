import { addDays, startOfWeek, weekDates } from "./calendar-time";

/**
 * CAL-002/CAL-006 Calendar state, kept in the URL so a refresh, a browser back or a deep link (a Goal period,
 * the Events screen) opens the same thing:
 *   /calendar?view=day|3day|week|month|list&date=YYYY-MM-DD&content=all|events&category=<id>|UNCATEGORIZED
 * The state is one reference date plus a view; every view derives its dates from that date, so switching views
 * never jumps away. `content` (Day + Event, or Events only) and `category` (which Events) are independent of
 * the view.
 */
export const CALENDAR_VIEWS = ["day", "3day", "week", "month", "list"] as const;
export type CalendarViewName = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_VIEW_LABEL: Record<CalendarViewName, string> = {
  day: "하루",
  "3day": "3일",
  week: "주",
  month: "월",
  list: "목록",
};

export const CALENDAR_CONTENTS = ["all", "events"] as const;
export type CalendarContent = (typeof CALENDAR_CONTENTS)[number];

export const CALENDAR_CONTENT_LABEL: Record<CalendarContent, string> = { all: "전체", events: "일정만" };

/** Days moved by ‹ / › in the day-based views (month moves by a calendar month, list like the week). */
const STEP_DAYS: Record<Exclude<CalendarViewName, "month">, number> = { week: 7, "3day": 3, day: 1, list: 7 };

export interface CalendarViewState {
  view: CalendarViewName;
  /** The day the user is looking at; the week and month views show the week / month containing it. */
  date: string;
  content: CalendarContent;
  /** Event Category filter: null = every Event, "UNCATEGORIZED", or a Category id. Never hides Days. */
  category: string | null;
}

const isDate = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseCalendarViewState(params: { get(name: string): string | null }, today: string): CalendarViewState {
  const view = params.get("view");
  const date = params.get("date");
  const content = params.get("content");
  const category = params.get("category");
  return {
    // A deep link without a view (e.g. from a Goal period label) opens the week view.
    view: (CALENDAR_VIEWS as readonly string[]).includes(view ?? "") ? (view as CalendarViewName) : "week",
    date: isDate(date) ? date : today,
    // Old links have no content: they keep showing Days and Events.
    content: content === "events" ? "events" : "all",
    category: category && /^[A-Za-z0-9-]{1,64}$/.test(category) ? category : null,
  };
}

/** Only non-default values are written; `date` is left out when it is today, so plain links mean "today". */
export function calendarHref(state: Pick<CalendarViewState, "view" | "date"> & Partial<CalendarViewState>, today: string): string {
  const query = new URLSearchParams({ view: state.view });
  if (state.date !== today) query.set("date", state.date);
  if (state.content === "events") query.set("content", "events");
  if (state.category) query.set("category", state.category);
  return `/calendar?${query.toString()}`;
}

const parts = (date: string) => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
  day: Number(date.slice(8, 10)),
});

const pad = (value: number) => String(value).padStart(2, "0");
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

export function monthStart(date: string): string {
  const { year, month } = parts(date);
  return `${year}-${pad(month)}-01`;
}

export function monthEnd(date: string): string {
  const { year, month } = parts(date);
  return `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
}

/** The same day in the month `delta` months away, clamped to that month's length (1/31 → 2/28). */
export function shiftMonth(date: string, delta: number): string {
  const { year, month, day } = parts(date);
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = index - nextYear * 12 + 1;
  return `${nextYear}-${pad(nextMonth)}-${pad(Math.min(day, daysInMonth(nextYear, nextMonth)))}`;
}

/**
 * The month grid: whole Monday-start weeks from the week of the 1st to the week of the last day (5 or 6
 * rows). Dates of the neighbouring months fill the first and last week, like a paper calendar.
 */
export function monthGridDates(date: string): string[] {
  const first = startOfWeek(monthStart(date));
  const last = addDays(startOfWeek(monthEnd(date)), 6);
  const dates: string[] = [];
  for (let current = first; current <= last; current = addDays(current, 1)) dates.push(current);
  return dates;
}

/** The dates a view shows (and loads): a Monday-start week, three days, one day or the month grid. */
export function viewDates(state: Pick<CalendarViewState, "view" | "date">): string[] {
  switch (state.view) {
    case "week":
    case "list":
      return weekDates(startOfWeek(state.date));
    case "3day":
      return [0, 1, 2].map((offset) => addDays(state.date, offset));
    case "day":
      return [state.date];
    case "month":
      return monthGridDates(state.date);
  }
}

/** ‹ / ›: ±7 days (week, list), ±3, ±1, or ±1 month. */
export function shiftCalendarDate(state: Pick<CalendarViewState, "view" | "date">, direction: number): string {
  return state.view === "month" ? shiftMonth(state.date, direction) : addDays(state.date, STEP_DAYS[state.view] * direction);
}

/** "2026년 9월 16일" */
export function koreanDate(date: string): string {
  const { year, month, day } = parts(date);
  return `${year}년 ${month}월 ${day}일`;
}

/** Korean range label ("2026년 9월 14일 ~ 9월 20일", "2026년 9월"); the year is repeated only when it changes. */
export function calendarRangeLabel(state: Pick<CalendarViewState, "view" | "date">): string {
  if (state.view === "month") {
    const { year, month } = parts(state.date);
    return `${year}년 ${month}월`;
  }
  const dates = viewDates(state);
  const start = dates[0]!;
  const end = dates[dates.length - 1]!;
  if (start === end) return koreanDate(start);

  const to = parts(end);
  if (parts(start).year !== to.year) return `${koreanDate(start)} ~ ${koreanDate(end)}`;
  return `${koreanDate(start)} ~ ${to.month}월 ${to.day}일`;
}
