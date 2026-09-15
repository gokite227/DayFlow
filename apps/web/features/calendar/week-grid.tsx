"use client";

import type { DayResponse, DayScheduleResponse } from "@dayflow/api-client";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { DropTarget } from "./calendar-drop";
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
  weekdayShort,
} from "./calendar-time";

/** Pixel height of one hour; one snap step is HOUR_HEIGHT * CALENDAR_SNAP_MINUTES / 60. */
export const HOUR_HEIGHT = 48;

export interface DayDragData {
  day: DayResponse;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function WeekGrid({
  dates,
  today,
  nowMinutes,
  days,
  disabled,
  scrollRef,
  onOpen,
  onResize,
}: {
  dates: string[];
  today: string;
  nowMinutes: number | null;
  days: DayResponse[];
  disabled: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onOpen: (day: DayResponse) => void;
  onResize: (day: DayResponse, lengthMinutes: number) => void;
}) {
  // A: date + schedule → time grid. B: date only → date-only area. (C: no date → Unscheduled panel.)
  const scheduledOn = (date: string) =>
    days.flatMap((day) =>
      day.schedule !== null && wallClock(day.schedule.startAt).date === date ? [{ day, schedule: day.schedule }] : [],
    );
  const dateOnlyOn = (date: string) => days.filter((day) => day.schedule === null && day.plannedDate === date);

  return (
    <div className="tc-week">
      <div className="tc-row tc-head">
        <div className="tc-gutter" />
        {dates.map((date) => (
          <div key={date} className={`tc-head-cell${date === today ? " today" : ""}`}>
            <span className="tc-weekday">{weekdayShort(date)}</span>
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
            disabled={disabled}
            onOpen={onOpen}
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
          {dates.map((date) => (
            <TimeColumn key={date} date={date} today={date === today}>
              {date === today && nowMinutes !== null && <NowLine minutes={nowMinutes} />}
              {scheduledOn(date).map(({ day, schedule }) => (
                <ScheduledBlock
                  key={day.id}
                  day={day}
                  schedule={schedule}
                  disabled={disabled}
                  onOpen={onOpen}
                  onResize={onResize}
                />
              ))}
            </TimeColumn>
          ))}
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
  disabled,
  onOpen,
}: {
  date: string;
  today: boolean;
  days: DayResponse[];
  disabled: boolean;
  onOpen: (day: DayResponse) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `date:${date}`, data: { kind: "date", date } satisfies DropTarget });
  return (
    <div
      ref={setNodeRef}
      className={`tc-dateonly${today ? " today" : ""}${isOver ? " dragover" : ""}`}
      data-date={date}
    >
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

function ScheduledBlock({
  day,
  schedule,
  disabled,
  onOpen,
  onResize,
}: {
  day: DayResponse;
  schedule: DayScheduleResponse;
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
        height: Math.max((visibleLength / 60) * HOUR_HEIGHT - 1, (CALENDAR_SNAP_MINUTES / 60) * HOUR_HEIGHT - 1),
        opacity: isDragging ? 0.35 : undefined,
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
