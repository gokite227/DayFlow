import type { DayResponse, DayScheduleResponse, EventOccurrenceResponse, GoalResponse, SetDayScheduleRequest } from "@dayflow/api-client";
import { formatOffsetDateTime, layoutOverlaps, zonedDateTimeToInstant, type LayoutSlot } from "@dayflow/domain";
import { addDays, isLocalDate, startOfWeek, wallClock, weekDates } from "../../lib/dates";
import { dayDateProblem } from "../goals/period-goal-helpers";
import type { WeekStart } from "../settings/settings-model";

/**
 * Mobile Calendar model (CAL-001..006). Same drop meanings and overlap lanes as the Web week grid (shared
 * @dayflow/domain layoutOverlaps), with mobile sizes.
 *
 * Time precision and interaction snap are separate:
 * - stored times, the detail editors and the drawing are minute-precise (20:27 is drawn at 20:27);
 * - only a Calendar drag, drop or resize that actually moves something snaps to 15 minutes.
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
/** Pixel height of one hour: 15 minutes = 12px, 1 minute = 0.8px. */
export const HOUR_HEIGHT = 48;
/** Drawing floor of the drag ghost and drawer sizes (grid blocks use blockGeometry). */
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
  const rawStart = (offsetPx / hourHeight) * 60;
  const startMinutes = clamp(snapMinutes(rawStart), 0, latestStart);
  if (day.schedule) {
    const current = wallClock(day.schedule.startAt);
    // Put back where it already was (less than half a snap step away): nothing changes, so an off-grid time such
    // as 20:27 is not rounded just because the block was picked up.
    if (current.date === target.date && (current.minutes === startMinutes || Math.abs(rawStart - current.minutes) < SNAP_MINUTES / 2)) return null;
  }
  return { type: "setSchedule", date: target.date, startMinutes, lengthMinutes };
}

/**
 * Resize: the new length after dragging the bottom handle by `deltaPx`. The end snaps to the 15-minute grid
 * (20:27–21:27 dragged down → ends at 21:45), the block keeps at least 15 minutes (up to the next grid line) and
 * never passes midnight. A movement of less than half a snap step changes nothing, so touching the handle of an
 * off-grid schedule does not round it.
 */
export function resizedLength(originLength: number, deltaPx: number, startMinutes: number, hourHeight = HOUR_HEIGHT): number {
  const deltaMinutes = (deltaPx / hourHeight) * 60;
  if (Math.abs(deltaMinutes) < SNAP_MINUTES / 2) return originLength;
  const shortestEnd = Math.min(Math.ceil((startMinutes + MIN_SCHEDULE_MINUTES) / SNAP_MINUTES) * SNAP_MINUTES, MINUTES_PER_DAY);
  const end = clamp(snapMinutes(startMinutes + originLength + deltaMinutes), shortestEnd, MINUTES_PER_DAY);
  return end - startMinutes;
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
  // Lanes follow the real times: 20:27–20:32 and 20:35–21:00 do not share lanes although both are drawn taller than
  // 5 minutes. A zero-length Event counts as one minute so it still gets its own lane next to what covers it.
  const slots = layoutOverlaps([
    ...timedDays.map((placement) => ({
      key: placement.key,
      start: placement.start,
      end: Math.min(placement.start + Math.max(placement.length, 1), MINUTES_PER_DAY),
    })),
    ...events.map((placement) => ({ key: placement.key, start: placement.start, end: Math.max(placement.end, placement.start + 1) })),
  ]);
  return { days: timedDays, events, slots };
}

/** How much a grid block shows, by its drawn height. */
export type BlockTier =
  /** Title and the time range. */
  | "range"
  /** Title and the start time. */
  | "start"
  /** Title only. */
  | "title"
  /** Title only, smaller and without padding. */
  | "tiny";

/**
 * Block sizes in px. The tiers are chosen so the lines they show always fit inside the drawn height (the block also
 * clips), and the resize handle never covers text: inside the block only when there is room below the text,
 * otherwise just below the block when there is free space, otherwise no handle.
 */
export const BLOCK_METRICS = {
  /** Shortest drawn block (about 22 minutes tall): one readable line. Never reaches into the next block. */
  minVisualHeight: 18,
  padding: 2,
  titleLine: 15,
  timeLine: 13,
  tinyTitleLine: 13,
  handleHeight: 12,
  /** Smallest comfortable press area; short blocks get hit slop up to this, without reaching into neighbours. */
  minHitHeight: 32,
} as const;

const TIER_PAD = BLOCK_METRICS.padding;
/** Height the text of each tier needs. */
export const TIER_CONTENT_HEIGHT: Record<BlockTier, number> = {
  range: TIER_PAD + BLOCK_METRICS.titleLine + BLOCK_METRICS.timeLine + TIER_PAD,
  start: TIER_PAD + BLOCK_METRICS.titleLine + BLOCK_METRICS.timeLine + TIER_PAD,
  title: TIER_PAD + BLOCK_METRICS.titleLine + TIER_PAD,
  tiny: BLOCK_METRICS.tinyTitleLine,
};

export function blockTier(height: number): BlockTier {
  if (height >= TIER_CONTENT_HEIGHT.range + BLOCK_METRICS.handleHeight) return "range";
  if (height >= TIER_CONTENT_HEIGHT.start) return "start";
  if (height >= TIER_CONTENT_HEIGHT.title) return "title";
  return "tiny";
}

export interface BlockGeometry {
  /** y of the real start time. */
  top: number;
  /** Height of the real duration (0 for a point Event). */
  timeHeight: number;
  /** Drawn height: the real duration, or the floor when that is taller and there is room. */
  height: number;
  /** Drawn taller than its real duration (only the real part is filled, so it does not look longer). */
  floored: boolean;
  tier: BlockTier;
  handle: "inside" | "below" | "none";
  /** Extra press area above and below the drawn block, never overlapping another block. */
  hitSlop: { top: number; bottom: number };
}

/**
 * Geometry of one block. `roomBelowMinutes`: minutes from its start to the next block sharing horizontal space (or
 * midnight). `roomAbovePx`: free px between the previous such block (including its handle) and this start.
 */
export function blockGeometry(startMinutes: number, lengthMinutes: number, roomBelowMinutes: number, roomAbovePx: number, hourHeight = HOUR_HEIGHT): BlockGeometry {
  const top = (startMinutes / 60) * hourHeight;
  const timeHeight = (Math.max(lengthMinutes, 0) / 60) * hourHeight;
  const roomBelow = (Math.max(roomBelowMinutes, 0) / 60) * hourHeight;
  // 1px gap to the next block, as before; the floor never reaches into the next block.
  const height = Math.max(Math.max(timeHeight, Math.min(BLOCK_METRICS.minVisualHeight, roomBelow)) - 1, 1);
  const tier = blockTier(height);
  const freeBelow = roomBelow - height - 1;
  const handle = tier === "range" ? "inside" : freeBelow >= BLOCK_METRICS.handleHeight ? "below" : "none";
  const missing = Math.max(BLOCK_METRICS.minHitHeight - height, 0);
  const slopTop = Math.max(Math.min(Math.ceil(missing / 2), Math.floor(roomAbovePx / 2)), 0);
  const slopBottom = handle === "below" ? 0 : Math.max(Math.min(missing - slopTop, Math.floor(freeBelow / 2)), 0);
  return { top, timeHeight, height, floored: height > timeHeight, tier, handle, hitSlop: { top: slopTop, bottom: slopBottom } };
}

export type ColumnBlockGeometry = BlockGeometry & { roomBelowMinutes: number; roomAbovePx: number };

/** Geometry of every block in one column by key, with the room each block has (see blockGeometry). */
export function columnGeometry(placement: ColumnPlacement, hourHeight = HOUR_HEIGHT): Map<string, ColumnBlockGeometry> {
  const items = [
    ...placement.days.map((day) => ({ key: day.key, start: day.start, length: Math.min(day.length, MINUTES_PER_DAY - day.start) })),
    ...placement.events.map((event) => ({ key: event.key, start: event.start, length: event.point ? 0 : event.end - event.start })),
  ]
    .map((item) => {
      const slot = placement.slots.get(item.key) ?? { lane: 0, lanes: 1 };
      return { ...item, x0: slot.lane / slot.lanes, x1: (slot.lane + 1) / slot.lanes };
    })
    .sort((a, b) => a.start - b.start || a.x0 - b.x0);
  const shareSpace = (a: { x0: number; x1: number }, b: { x0: number; x1: number }) => a.x0 < b.x1 && b.x0 < a.x1;
  const result = new Map<string, ColumnBlockGeometry>();
  const drawnBottom = new Map<string, number>();
  for (const item of items) {
    const nextStarts = items.filter((other) => other !== item && other.start > item.start && shareSpace(item, other)).map((other) => other.start);
    const roomBelowMinutes = Math.min(...nextStarts, MINUTES_PER_DAY) - item.start;
    const top = (item.start / 60) * hourHeight;
    const bottomsAbove = items
      .filter((other) => other !== item && other.start < item.start && shareSpace(item, other))
      .map((other) => drawnBottom.get(other.key) ?? 0);
    const roomAbovePx = top - Math.max(...bottomsAbove, 0);
    const geometry = blockGeometry(item.start, item.length, roomBelowMinutes, roomAbovePx, hourHeight);
    drawnBottom.set(item.key, geometry.top + geometry.height + (geometry.handle === "below" ? BLOCK_METRICS.handleHeight : 0));
    result.set(item.key, { ...geometry, roomBelowMinutes, roomAbovePx });
  }
  return result;
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