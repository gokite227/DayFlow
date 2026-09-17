import type { DayResponse, DayScheduleResponse, EventOccurrenceResponse, GoalResponse, SetDayScheduleRequest } from "@dayflow/api-client";
import { formatOffsetDateTime, layoutOverlaps, zonedDateTimeToInstant, type LayoutSlot } from "@dayflow/domain";
import { addDays, isLocalDate, startOfWeek, wallClock, weekDates } from "../../lib/dates";
import { dayDateProblem } from "../goals/period-goal-helpers";
import type { WeekStart } from "../settings/settings-model";

/**
 * Mobile Calendar model (CAL-001..006). Same rules as the Web week grid — 15-minute snap, minimum schedule
 * length, drop meanings, overlap lanes (shared @dayflow/domain layoutOverlaps) — with mobile sizes.
 */

export const CALENDAR_VIEWS = ["day", "3day", "week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export const CALENDAR_VIEW_LABEL: Record<CalendarView, string> = { day: "하루", "3day": "3일", week: "주", month: "월" };
/** Mobile opens on a single day: the easiest width to plan and drag times in. */
export const DEFAULT_CALENDAR_VIEW: CalendarView = "day";

/** Independent of the view: Days and Events, or Events only. */
export const CALENDAR_CONTENTS = ["all", "events"] as const;
export type CalendarContent = (typeof CALENDAR_CONTENTS)[number];
export const CALENDAR_CONTENT_LABEL: Record<CalendarContent, string> = { all: "전체", events: "일정만" };

export function parseCalendarContent(param: string | string[] | undefined): CalendarContent {
  return (Array.isArray(param) ? param[0] : param) === "events" ? "events" : "all";
}

export function parseCalendarView(param: string | string[] | undefined): CalendarView {
  const value = Array.isArray(param) ? param[0] : param;
  return (CALENDAR_VIEWS as readonly string[]).includes(value ?? "") ? (value as CalendarView) : DEFAULT_CALENDAR_VIEW;
}

/**
 * The Days the Calendar works with. 일정만 removes every Day from the data (timed, date-only, unscheduled), so
 * nothing hidden can be dragged, resized, dropped on or take a lane in the overlap layout.
 */
export function contentDays(days: readonly DayResponse[], content: CalendarContent): DayResponse[] {
  return content === "events" ? [] : [...days];
}

export const SNAP_MINUTES = 15;
export const MIN_SCHEDULE_MINUTES = SNAP_MINUTES;
export const MINUTES_PER_DAY = 24 * 60;
/** Pixel height of one hour. 15 minutes = 12px; blocks are drawn at least MIN_BLOCK_HEIGHT tall. */
export const HOUR_HEIGHT = 48;
/** Drawing floor only: the stored duration can be shorter than what this height represents. */
export const MIN_BLOCK_HEIGHT = 24;
export const NOW_SCROLL_OFFSET_HOURS = 2;

export function selectedDateFromParam(param: string | string[] | undefined, today: string): string {
  const value = Array.isArray(param) ? param[0] : param;
  return value !== undefined && isLocalDate(value) ? value : today;
}

const pad2 = (value: number) => String(value).padStart(2, "0");
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: string): string {
  return `${date.slice(0, 7)}-${pad2(daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7))))}`;
}

/** The same day `delta` months away, clamped to that month's length (1/31 → 2/28). */
export function shiftMonth(date: string, delta: number): string {
  const index = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 + delta;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return `${year}-${pad2(month)}-${pad2(Math.min(Number(date.slice(8, 10)), daysInMonth(year, month)))}`;
}

/** Whole weeks (user week start) from the week of the 1st to the week of the last day: 5 or 6 rows of 7. */
export function monthGridDates(date: string, weekStart: WeekStart): string[] {
  const first = startOfWeek(monthStart(date), weekStart);
  const last = addDays(startOfWeek(monthEnd(date), weekStart), 6);
  const dates: string[] = [];
  for (let current = first; current <= last; current = addDays(current, 1)) dates.push(current);
  return dates;
}

/** Dates a view shows: the date, three days from it, the week containing it, or the month grid (user week start). */
export function viewDates(view: CalendarView, date: string, weekStart: WeekStart): string[] {
  switch (view) {
    case "day":
      return [date];
    case "3day":
      return [0, 1, 2].map((offset) => addDays(date, offset));
    case "week":
      return weekDates(startOfWeek(date, weekStart));
    case "month":
      return monthGridDates(date, weekStart);
  }
}

const STEP_DAYS: Record<Exclude<CalendarView, "month">, number> = { day: 1, "3day": 3, week: 7 };

/** ‹ / ›: ±1 day, ±3 days, ±7 days or ±1 month. */
export function shiftViewDate(view: CalendarView, date: string, direction: -1 | 1): string {
  return view === "month" ? shiftMonth(date, direction) : addDays(date, STEP_DAYS[view] * direction);
}

/** Toolbar title: the date range, or "2026년 9월" for the month view. */
export function viewRangeLabel(view: CalendarView, date: string, dates: readonly string[]): string {
  return view === "month" ? `${Number(date.slice(0, 4))}년 ${Number(date.slice(5, 7))}월` : rangeLabel(dates);
}

const koreanDate = (date: string) => `${Number(date.slice(0, 4))}년 ${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

/** "2026년 9월 16일", "2026년 9월 14일 ~ 9월 20일" (year repeated only when it changes). */
export function rangeLabel(dates: readonly string[]): string {
  const start = dates[0] ?? "";
  const end = dates[dates.length - 1] ?? start;
  if (start === end) return koreanDate(start);
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${koreanDate(start)} ~ ${koreanDate(end)}`;
  return `${koreanDate(start)} ~ ${Number(end.slice(5, 7))}월 ${Number(end.slice(8, 10))}일`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Nearest multiple of 15 minutes (10:07 → 10:00, 10:08 → 10:15). */
export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function durationMinutes(schedule: Pick<DayScheduleResponse, "startAt" | "endAt">): number {
  return Math.round((Date.parse(schedule.endAt) - Date.parse(schedule.startAt)) / 60_000);
}

/** Length for a Day without a schedule: its estimate snapped, at least the minimum (Web rule). */
export function defaultScheduleLength(estimatedMinutes: number): number {
  return Math.max(snapMinutes(estimatedMinutes), MIN_SCHEDULE_MINUTES);
}

export function blockHeight(lengthMinutes: number, hourHeight = HOUR_HEIGHT): number {
  return Math.max((lengthMinutes / 60) * hourHeight - 1, MIN_BLOCK_HEIGHT);
}

/** y of the current-time line inside the grid. */
export function nowLineTop(nowMinutes: number, hourHeight = HOUR_HEIGHT): number {
  return (clamp(nowMinutes, 0, MINUTES_PER_DAY) / 60) * hourHeight;
}

/** Initial vertical scroll: a little above "now", never negative. */
export function initialScrollY(nowMinutes: number, hourHeight = HOUR_HEIGHT): number {
  return Math.max(nowMinutes / 60 - NOW_SCROLL_OFFSET_HOURS, 0) * hourHeight;
}

export type DropTarget = { kind: "time"; date: string } | { kind: "date"; date: string } | { kind: "unscheduled" };

export type DropAction =
  /** PUT schedule (create or replace). The server keeps plannedDate in sync. */
  | { type: "setSchedule"; date: string; startMinutes: number; lengthMinutes: number }
  /** DELETE schedule (→ date-only), then optionally PATCH plannedDate. */
  | { type: "unschedule"; moveToDate: string | null }
  /** PATCH plannedDate; null clears the date (the server removes any schedule). */
  | { type: "moveDate"; date: string | null }
  | null;

/** The date a Day would have after the action; undefined when its date does not change. */
export function dropTargetDate(action: Exclude<DropAction, null>): string | null | undefined {
  switch (action.type) {
    case "setSchedule":
      return action.date;
    case "unschedule":
      return action.moveToDate ?? undefined;
    case "moveDate":
      return action.date;
  }
}

/**
 * Why a drop would put a Day outside its WEEK or PERIOD Goal (the server answers DATE_OUTSIDE_…), or null.
 * Checked before the optimistic update, so a refused drop never moves the block.
 */
export function dropDateProblem(goal: Pick<GoalResponse, "kind" | "startDate" | "endDate"> | undefined, action: Exclude<DropAction, null>): string | null {
  return dayDateProblem(goal, dropTargetDate(action) ?? null);
}

/**
 * What a drop means (same as the Web planDrop). `offsetPx` is how far the dragged block's top edge sits
 * below the top of the time grid; the start snaps to 15 minutes and the block must end by midnight.
 */
export function planDrop(day: DayResponse, target: DropTarget, offsetPx: number, hourHeight = HOUR_HEIGHT): DropAction {
  if (target.kind === "unscheduled") return day.plannedDate === null ? null : { type: "moveDate", date: null };
  if (target.kind === "date") {
    if (day.schedule) return { type: "unschedule", moveToDate: target.date === day.plannedDate ? null : target.date };
    return target.date === day.plannedDate ? null : { type: "moveDate", date: target.date };
  }
  const lengthMinutes = day.schedule ? durationMinutes(day.schedule) : defaultScheduleLength(day.estimatedMinutes);
  const latestStart = Math.max(Math.floor((MINUTES_PER_DAY - lengthMinutes) / SNAP_MINUTES) * SNAP_MINUTES, 0);
  const startMinutes = clamp(snapMinutes((offsetPx / hourHeight) * 60), 0, latestStart);
  if (day.schedule) {
    const current = wallClock(day.schedule.startAt);
    if (current.date === target.date && current.minutes === startMinutes) return null;
  }
  return { type: "setSchedule", date: target.date, startMinutes, lengthMinutes };
}

/** Resize: the new length after dragging the bottom handle by `deltaPx`, snapped and kept inside the day. */
export function resizedLength(originLength: number, deltaPx: number, startMinutes: number, hourHeight = HOUR_HEIGHT): number {
  return clamp(snapMinutes(originLength + (deltaPx / hourHeight) * 60), MIN_SCHEDULE_MINUTES, MINUTES_PER_DAY - startMinutes);
}

/**
 * PUT /days/{dayId}/schedule body for a wall-clock date and minutes in `timeZone`. expectedVersion is null
 * to create a schedule and the current version to replace one.
 */
export function scheduleRequest(
  date: string,
  startMinutes: number,
  lengthMinutes: number,
  currentSchedule: DayResponse["schedule"],
  timeZone: string,
): SetDayScheduleRequest {
  const at = (minutes: number) => {
    const dayShift = Math.floor(minutes / MINUTES_PER_DAY);
    const target = addDays(date, dayShift);
    const minuteOfDay = minutes - dayShift * MINUTES_PER_DAY;
    const instant = zonedDateTimeToInstant(
      {
        year: Number(target.slice(0, 4)),
        month: Number(target.slice(5, 7)),
        day: Number(target.slice(8, 10)),
        hour: Math.floor(minuteOfDay / 60),
        minute: minuteOfDay % 60,
        second: 0,
        millisecond: 0,
      },
      timeZone,
    );
    return formatOffsetDateTime(instant, timeZone);
  };
  return {
    startAt: at(startMinutes),
    endAt: at(startMinutes + lengthMinutes),
    timezone: timeZone,
    expectedVersion: currentSchedule === null ? null : currentSchedule.version,
  };
}

/** The Day as it will look after a drop succeeds; used for the optimistic cache update. */
export function applyDropToDay(day: DayResponse, action: Exclude<DropAction, null>, timeZone: string): DayResponse {
  switch (action.type) {
    case "setSchedule": {
      const body = scheduleRequest(action.date, action.startMinutes, action.lengthMinutes, day.schedule, timeZone);
      return {
        ...day,
        plannedDate: action.date,
        schedule: {
          id: day.schedule?.id ?? `optimistic:${day.id}`,
          dayId: day.id,
          startAt: body.startAt,
          endAt: body.endAt,
          timezone: timeZone,
          createdAt: day.schedule?.createdAt ?? day.updatedAt,
          updatedAt: day.schedule?.updatedAt ?? day.updatedAt,
          version: day.schedule?.version ?? 0,
        },
      };
    }
    case "unschedule":
      return { ...day, schedule: null, plannedDate: action.moveToDate ?? day.plannedDate };
    case "moveDate":
      return { ...day, plannedDate: action.date, schedule: action.date === null ? null : day.schedule };
  }
}

export interface TimedDayPlacement {
  key: string;
  day: DayResponse;
  start: number;
  length: number;
}

export interface TimedEventPlacement {
  key: string;
  occurrence: EventOccurrenceResponse;
  start: number;
  end: number;
  /** Zero-length Events (e.g. a 23:59 deadline). */
  point: boolean;
}

export interface ColumnPlacement {
  days: TimedDayPlacement[];
  events: TimedEventPlacement[];
  slots: Map<string, LayoutSlot>;
}

/** Timed Days and Events of one date column with shared overlap lanes (CAL-004). */
export function columnPlacement(date: string, days: readonly DayResponse[], occurrences: readonly EventOccurrenceResponse[]): ColumnPlacement {
  const timedDays = days.flatMap((day): TimedDayPlacement[] => {
    if (day.schedule === null) return [];
    const start = wallClock(day.schedule.startAt);
    return start.date === date ? [{ key: `day:${day.id}`, day, start: start.minutes, length: durationMinutes(day.schedule) }] : [];
  });
  const events = occurrences.flatMap((occurrence, index): TimedEventPlacement[] => {
    if (occurrence.allDay || occurrence.startAt === null || occurrence.endAt === null) return [];
    const start = wallClock(occurrence.startAt);
    if (start.date !== date) return [];
    const end = wallClock(occurrence.endAt);
    return [
      {
        key: `event:${occurrence.eventId}:${index}`,
        occurrence,
        start: start.minutes,
        end: end.date === date ? end.minutes : MINUTES_PER_DAY,
        point: occurrence.startAt === occurrence.endAt,
      },
    ];
  });
  const slots = layoutOverlaps([
    ...timedDays.map((placement) => ({
      key: placement.key,
      start: placement.start,
      end: Math.min(placement.start + Math.max(placement.length, SNAP_MINUTES), MINUTES_PER_DAY),
    })),
    ...events.map((placement) => ({ key: placement.key, start: placement.start, end: Math.max(placement.end, placement.start + SNAP_MINUTES) })),
  ]);
  return { days: timedDays, events, slots };
}

/** The top area of a date column: all-day Events and date-only Days (planned date, no schedule). */
export function dateOnlyItems(date: string, days: readonly DayResponse[], occurrences: readonly EventOccurrenceResponse[]) {
  return {
    allDayEvents: occurrences.filter(
      (occurrence) => occurrence.allDay && occurrence.startDate !== null && occurrence.endDateExclusive !== null && occurrence.startDate <= date && date < occurrence.endDateExclusive,
    ),
    dateOnlyDays: days.filter((day) => day.schedule === null && day.plannedDate === date).sort((a, b) => Number(b.coreDay) - Number(a.coreDay)),
  };
}

/** C: Days without a date (same as the Web Unscheduled panel). */
export function unscheduledDays(days: readonly DayResponse[]): DayResponse[] {
  return days.filter((day) => day.plannedDate === null);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DropGeometry {
  dates: readonly string[];
  /** Window rect of the time grid viewport (below the date-only row). */
  grid: Rect | null;
  /** Window rect of the date-only row. */
  dateOnly: Rect | null;
  /** Window rects that mean "날짜 없음" (toolbar button, open drawer). */
  unscheduled: readonly Rect[];
  gutterWidth: number;
  columnWidth: number;
  scrollX: number;
  scrollY: number;
  hourHeight: number;
}

const inside = (rect: Rect | null, x: number, y: number) => rect !== null && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

function columnAt(x: number, rect: Rect, geometry: DropGeometry): string | null {
  const local = x - rect.x - geometry.gutterWidth + geometry.scrollX;
  if (local < 0) return null;
  return geometry.dates[Math.floor(local / geometry.columnWidth)] ?? null;
}

/**
 * Turns a finger position (window coordinates) and the dragged block's top edge into a drop target and the
 * block's offset inside the time grid. "날짜 없음" zones win over the grid underneath them.
 */
export function resolveDrop(point: { x: number; y: number }, blockTopY: number, geometry: DropGeometry): { target: DropTarget; offsetPx: number } | null {
  if (geometry.unscheduled.some((rect) => inside(rect, point.x, point.y))) return { target: { kind: "unscheduled" }, offsetPx: 0 };
  if (geometry.dateOnly && inside(geometry.dateOnly, point.x, point.y)) {
    const date = columnAt(point.x, geometry.dateOnly, geometry);
    return date ? { target: { kind: "date", date }, offsetPx: 0 } : null;
  }
  if (geometry.grid && inside(geometry.grid, point.x, point.y)) {
    const date = columnAt(point.x, geometry.grid, geometry);
    return date ? { target: { kind: "time", date }, offsetPx: blockTopY - geometry.grid.y + geometry.scrollY } : null;
  }
  return null;
}

/** Short label shown on the dragged block, e.g. "9/17 14:00–15:00", "9/17 · 날짜만", "날짜 없음". */
export function describeDropAction(action: DropAction, day: DayResponse): string {
  if (action === null) return "변경 없음";
  const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  switch (action.type) {
    case "setSchedule":
      return `${md(action.date)} ${formatClock(action.startMinutes)}–${formatClock(Math.min(action.startMinutes + action.lengthMinutes, MINUTES_PER_DAY))}`;
    case "unschedule":
      return `${md(action.moveToDate ?? day.plannedDate ?? "")} · 날짜만`;
    case "moveDate":
      return action.date === null ? "날짜 없음으로" : `${md(action.date)} · 날짜만`;
  }
}