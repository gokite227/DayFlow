"use client";

import type { DayResponse, DayScheduleResponse, EventOccurrenceResponse } from "@dayflow/api-client";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { EVENT_TYPE_LABEL, eventTime } from "../events/event-values";
import type { DropTarget } from "./calendar-drop";
import { layoutOverlaps, type LayoutSlot } from "./calendar-layout";
import {
  CALENDAR_SNAP_MINUTES,
  MINUTES_PER_DAY,
  MIN_SCHEDULE_MINUTES,
  clamp,
  dayOfMonth,
  durationMinutes,
  formatMinutes,
  snapMinutes,
  wallClock,
  weekdayKr,
} from "./calendar-time";

/**
 * Pixel height of one hour; one snap step is HOUR_HEIGHT * CALENDAR_SNAP_MINUTES / 60. Compact on
 * purpose (CAL-006) so more of the day fits on screen; 15 minutes is still 10px, enough to click and
 * resize. Placement precision stays CALENDAR_SNAP_MINUTES.
 */
export const HOUR_HEIGHT = 40;

/**
 * In the compact grid 15 minutes is 10px, too small to read a title or grab the resize handle, so a
 * block is never drawn shorter than this. Only the drawing has a floor; the stored times do not.
 */
const MIN_BLOCK_HEIGHT = 16;

export interface DayDragData {
  day: DayResponse;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** A timed Event occurrence placed in one day column (Event timezone wall clock, like Day schedules). */
interface TimedEventPlacement {
  key: string;
  occurrence: EventOccurrenceResponse;
  start: number;
  end: number;
  point: boolean;
}

/** Visual minimum for layout, so short blocks and point Events (e.g. 23:59 deadlines) stay visible. */
const MIN_LAYOUT_MINUTES = CALENDAR_SNAP_MINUTES;

function timedEventsOn(date: string, occurrences: readonly EventOccurrenceResponse[]): TimedEventPlacement[] {
  return occurrences.flatMap((occurrence, index) => {
    const time = eventTime(occurrence);
    if (time.allDay) return [];
    const start = wallClock(time.startAt);
    if (start.date !== date) return [];
    const end = wallClock(time.endAt);
    return [
      {
        key: `event:${occurrence.eventId}:${index}`,
        occurrence,
        start: start.minutes,
        end: end.date === date ? end.minutes : MINUTES_PER_DAY,
        point: time.startAt === time.endAt,
      },
    ];
  });
}

/** Lane position inside a column; blocks in the same overlap group share the width. */
function laneStyle(slot: LayoutSlot | undefined): CSSProperties {
  const lanes = slot?.lanes ?? 1;
  const lane = slot?.lane ?? 0;
  return {
    left: `calc(${(lane / lanes) * 100}% + 2px)`,
    width: `calc(${100 / lanes}% - 5px)`,
    right: "auto",
  };
}

export function WeekGrid({
  dates,
  today,
  nowMinutes,
  days,
  occurrences,
  disabled,
  scrollRef,
  onOpen,
  onOpenEvent,
  onResize,
}: {
  dates: string[];
  today: string;
  nowMinutes: number | null;
  days: DayResponse[];
  occurrences: EventOccurrenceResponse[];
  disabled: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onOpen: (day: DayResponse) => void;
  onOpenEvent: (eventId: string) => void;
  onResize: (day: DayResponse, lengthMinutes: number) => void;
}) {
  // A: date + schedule → time grid. B: date only → date-only area. (C: no date → Unscheduled panel.)
  const scheduledOn = (date: string) =>
    days.flatMap((day) =>
      day.schedule !== null && wallClock(day.schedule.startAt).date === date ? [{ day, schedule: day.schedule }] : [],
    );
  const dateOnlyOn = (date: string) => days.filter((day) => day.schedule === null && day.plannedDate === date);
  // All-day Events show on every date they cover, above the time grid.
  const allDayEventsOn = (date: string) =>
    occurrences.filter((occurrence) => {
      const time = eventTime(occurrence);
      return time.allDay && time.startDate <= date && date < time.endDateExclusive;
    });

  const columnOn = (date: string) => {
    const scheduled = scheduledOn(date);
    const events = timedEventsOn(date, occurrences);
    // Day blocks and Event blocks share one overlap layout (CAL-004).
    const slots = layoutOverlaps([
      ...scheduled.map(({ day, schedule }) => {
        const start = wallClock(schedule.startAt).minutes;
        const end = Math.min(start + Math.max(durationMinutes(schedule), MIN_LAYOUT_MINUTES), MINUTES_PER_DAY);
        return { key: `day:${day.id}`, start, end };
      }),
      ...events.map((placement) => ({
        key: placement.key,
        start: placement.start,
        end: Math.max(placement.end, placement.start + MIN_LAYOUT_MINUTES),
      })),
    ]);
    return { scheduled, events, slots };
  };

  // One CSS variable drives every row, so week / 3 days / day share the same grid and overlap engine.
  const columns = { "--tc-columns": dates.length } as CSSProperties;

  return (
    <div className={`tc-week columns-${dates.length}`} style={columns}>
      <div className="tc-row tc-head">
        <div className="tc-gutter" />
        {dates.map((date) => (
          <div key={date} className={`tc-head-cell${date === today ? " today" : ""}`}>
            <span className="tc-weekday">{weekdayKr(date)}</span>
            {/* 3 days / 1 day have room for the month, which the range label alone would not show per column. */}
            {dates.length <= 3 && <span className="tc-headmonth">{Number(date.slice(5, 7))}월</span>}
            <span className="tc-daynum">{dayOfMonth(date)}</span>
          </div>
        ))}
      </div>

      <div className="tc-row tc-dateonly-row">
        <div className="tc-gutter tc-gutter-label">날짜만</div>
        {dates.map((date) => (
          <DateOnlyCell
            key={date}
            date={date}
            today={date === today}
            days={dateOnlyOn(date)}
            events={allDayEventsOn(date)}
            disabled={disabled}
            onOpen={onOpen}
            onOpenEvent={onOpenEvent}
          />
        ))}
      </div>

      <div className="tc-scroll" ref={scrollRef}>
        <div className="tc-row" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="tc-gutter tc-hours">
            {HOURS.map((hour) => (
              <div key={hour} className="tc-hour-label" style={{ top: hour * HOUR_HEIGHT }}>
                {hour === 0 ? "" : formatMinutes(hour * 60)}
              </div>
            ))}
          </div>
          {dates.map((date) => {
            const { scheduled, events, slots } = columnOn(date);
            return (
              <TimeColumn key={date} date={date} today={date === today}>
                {date === today && nowMinutes !== null && <NowLine minutes={nowMinutes} />}
                {events.map((placement) => (
                  <EventBlock
                    key={placement.key}
                    placement={placement}
                    slot={slots.get(placement.key)}
                    onOpenEvent={onOpenEvent}
                  />
                ))}
                {scheduled.map(({ day, schedule }) => (
                  <ScheduledBlock
                    key={day.id}
                    day={day}
                    schedule={schedule}
                    slot={slots.get(`day:${day.id}`)}
                    disabled={disabled}
                    onOpen={onOpen}
                    onResize={onResize}
                  />
                ))}
              </TimeColumn>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowLine({ minutes }: { minutes: number }) {
  return (
    <div className="tc-now" style={{ top: (minutes / 60) * HOUR_HEIGHT }} aria-label={`현재 시간 ${formatMinutes(minutes)}`}>
      <span className="tc-now-dot" />
      <span className="tc-now-time">{formatMinutes(minutes)}</span>
    </div>
  );
}

function DateOnlyCell({
  date,
  today,
  days,
  events,
  disabled,
  onOpen,
  onOpenEvent,
}: {
  date: string;
  today: boolean;
  days: DayResponse[];
  events: EventOccurrenceResponse[];
  disabled: boolean;
  onOpen: (day: DayResponse) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `date:${date}`, data: { kind: "date", date } satisfies DropTarget });
  return (
    <div
      ref={setNodeRef}
      className={`tc-dateonly${today ? " today" : ""}${isOver ? " dragover" : ""}`}
      data-date={date}
    >
      {events.map((occurrence) => (
        <button
          key={`${occurrence.eventId}:${occurrence.startDate}`}
          type="button"
          className={`tc-event-chip type-${occurrence.type.toLowerCase()}`}
          data-event-id={occurrence.eventId}
          onClick={() => onOpenEvent(occurrence.eventId)}
        >
          <span className="tc-event-type">{EVENT_TYPE_LABEL[occurrence.type]}</span>
          {occurrence.title}
        </button>
      ))}
      {days.map((day) => (
        <DayChip key={day.id} day={day} disabled={disabled} onOpen={onOpen} />
      ))}
    </div>
  );
}

function TimeColumn({ date, today, children }: { date: string; today: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `time:${date}`, data: { kind: "time", date } satisfies DropTarget });
  return (
    <div
      ref={setNodeRef}
      className={`tc-column${today ? " today" : ""}${isOver ? " dragover" : ""}`}
      style={{ backgroundSize: `100% ${HOUR_HEIGHT}px` }}
      data-date={date}
    >
      {children}
    </div>
  );
}

/** A Day chip used in date-only cells and the Unscheduled panel. */
export function DayChip({
  day,
  disabled,
  onOpen,
}: {
  day: DayResponse;
  disabled: boolean;
  onOpen: (day: DayResponse) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `day:${day.id}`,
    data: { day } satisfies DayDragData,
    disabled,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`tc-chip${day.status === "DONE" ? " done" : ""}${day.coreDay ? " core" : ""}`}
      style={{ opacity: isDragging ? 0.35 : undefined }}
      onClick={() => onOpen(day)}
      {...attributes}
      {...listeners}
    >
      {day.title}
    </button>
  );
}

/**
 * A timed Event: not a dnd-kit draggable and without a resize handle (CAL-005). Clicking opens the
 * Event form, where time changes are saved explicitly.
 */
function EventBlock({
  placement,
  slot,
  onOpenEvent,
}: {
  placement: TimedEventPlacement;
  slot: LayoutSlot | undefined;
  onOpenEvent: (eventId: string) => void;
}) {
  const { occurrence, start, end, point } = placement;
  const visibleLength = Math.max(end - start, 0);
  const compact = point || visibleLength <= CALENDAR_SNAP_MINUTES * 2;
  const open = () => onOpenEvent(occurrence.eventId);
  return (
    <div
      role="button"
      tabIndex={0}
      className={`tc-event type-${occurrence.type.toLowerCase()}${compact ? " compact" : ""}${point ? " point" : ""}`}
      data-event-id={occurrence.eventId}
      style={{
        top: (start / 60) * HOUR_HEIGHT,
        height: point ? MIN_BLOCK_HEIGHT : Math.max((visibleLength / 60) * HOUR_HEIGHT - 1, MIN_BLOCK_HEIGHT),
        ...laneStyle(slot),
      }}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter") open();
      }}
    >
      <div className="tc-block-title">
        <span className="tc-event-type">{EVENT_TYPE_LABEL[occurrence.type]}</span>
        {occurrence.title}
      </div>
      <div className="tc-block-time">
        {point ? formatMinutes(start) : `${formatMinutes(start)}–${formatMinutes(Math.min(end, MINUTES_PER_DAY))}`}
      </div>
    </div>
  );
}

function ScheduledBlock({
  day,
  schedule,
  slot,
  disabled,
  onOpen,
  onResize,
}: {
  day: DayResponse;
  schedule: DayScheduleResponse;
  slot: LayoutSlot | undefined;
  disabled: boolean;
  onOpen: (day: DayResponse) => void;
  onResize: (day: DayResponse, lengthMinutes: number) => void;
}) {
  const start = wallClock(schedule.startAt).minutes;
  const length = durationMinutes(schedule);
  const [previewLength, setPreviewLength] = useState<number | null>(null);
  const resizeOrigin = useRef<{ pointerY: number; length: number } | null>(null);

  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `day:${day.id}`,
    data: { day } satisfies DayDragData,
    disabled: disabled || previewLength !== null,
  });

  const shownLength = previewLength ?? length;
  const lengthFor = (pointerY: number) => {
    const origin = resizeOrigin.current;
    if (!origin) return length;
    const raw = origin.length + ((pointerY - origin.pointerY) / HOUR_HEIGHT) * 60;
    return clamp(snapMinutes(raw), MIN_SCHEDULE_MINUTES, MINUTES_PER_DAY - start);
  };

  // Resize uses plain pointer events; stopPropagation keeps dnd-kit from starting a move.
  const resizeHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeOrigin.current = { pointerY: event.clientY, length };
      setPreviewLength(length);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (resizeOrigin.current) setPreviewLength(lengthFor(event.clientY));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizeOrigin.current) return;
      const next = lengthFor(event.clientY);
      resizeOrigin.current = null;
      setPreviewLength(null);
      if (next !== length) onResize(day, next);
    },
    onClick: (event: ReactMouseEvent) => event.stopPropagation(),
  };

  const visibleLength = Math.min(shownLength, MINUTES_PER_DAY - start);
  const compact = visibleLength <= CALENDAR_SNAP_MINUTES * 2;

  return (
    <div
      ref={setNodeRef}
      className={`tc-block${day.status === "DONE" ? " done" : ""}${day.coreDay ? " core" : ""}${compact ? " compact" : ""}`}
      style={{
        top: (start / 60) * HOUR_HEIGHT,
        height: Math.max((visibleLength / 60) * HOUR_HEIGHT - 1, MIN_BLOCK_HEIGHT),
        opacity: isDragging ? 0.35 : undefined,
        ...laneStyle(slot),
      }}
      onClick={() => onOpen(day)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(day);
      }}
      {...attributes}
      {...listeners}
    >
      <div className="tc-block-title">{day.title}</div>
      <div className="tc-block-time">
        {formatMinutes(start)}–{formatMinutes(Math.min(start + shownLength, MINUTES_PER_DAY))}
      </div>
      <div className="tc-resize" aria-label="종료 시간 조절" {...resizeHandlers} />
    </div>
  );
}
