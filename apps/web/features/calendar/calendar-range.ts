import { addDays, startOfWeek, weekDates } from "./calendar-time";

/**
 * CAL-002/CAL-006 Calendar range state, kept in the URL (`/calendar?view=week|3day|day&date=YYYY-MM-DD`)
 * so a refresh, a browser back or a Goal deep link opens the same days. The state is a single reference
 * date plus a view; every view derives its dates from that date, so switching views never jumps away.
 */
export const CALENDAR_VIEWS = ["week", "3day", "day"] as const;
export type CalendarViewName = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_VIEW_LABEL: Record<CalendarViewName, string> = {
  week: "주",
  "3day": "3일",
  day: "하루",
};

/** Days moved by ‹ / › in each view. */
const STEP_DAYS: Record<CalendarViewName, number> = { week: 7, "3day": 3, day: 1 };

export interface CalendarViewState {
  view: CalendarViewName;
  /** The day the user is looking at; the week view shows the week containing it. */
  date: string;
}

const isDate = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseCalendarViewState(params: { get(name: string): string | null }, today: string): CalendarViewState {
  const view = params.get("view");
  const date = params.get("date");
  return {
    // A deep link without a view (e.g. from a Goal period label) opens the week view.
    view: (CALENDAR_VIEWS as readonly string[]).includes(view ?? "") ? (view as CalendarViewName) : "week",
    date: isDate(date) ? date : today,
  };
}

/** `date` is left out when it is today, so the plain /calendar link always means "today". */
export function calendarHref(state: CalendarViewState, today: string): string {
  const query = new URLSearchParams({ view: state.view });
  if (state.date !== today) query.set("date", state.date);
  return `/calendar?${query.toString()}`;
}

/** The dates a view shows: the Monday-start week, three days from the date, or the date itself. */
export function viewDates(state: CalendarViewState): string[] {
  switch (state.view) {
    case "week":
      return weekDates(startOfWeek(state.date));
    case "3day":
      return [0, 1, 2].map((offset) => addDays(state.date, offset));
    case "day":
      return [state.date];
  }
}

/** ‹ / ›: ±7 days in the week view, ±3 in the 3-day view, ±1 in the day view. */
export function shiftCalendarDate(state: CalendarViewState, direction: number): string {
  return addDays(state.date, STEP_DAYS[state.view] * direction);
}

const parts = (date: string) => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
  day: Number(date.slice(8, 10)),
});

/** "2026년 9월 16일" */
export function koreanDate(date: string): string {
  const { year, month, day } = parts(date);
  return `${year}년 ${month}월 ${day}일`;
}

/** Korean range label ("2026년 9월 14일 ~ 9월 20일"); the year is repeated only when it changes. */
export function calendarRangeLabel(state: CalendarViewState): string {
  const dates = viewDates(state);
  const start = dates[0]!;
  const end = dates[dates.length - 1]!;
  if (start === end) return koreanDate(start);

  const to = parts(end);
  if (parts(start).year !== to.year) return `${koreanDate(start)} ~ ${koreanDate(end)}`;
  return `${koreanDate(start)} ~ ${to.month}월 ${to.day}일`;
}
