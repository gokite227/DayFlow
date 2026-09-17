"use client";

import type { DayResponse, EventOccurrenceResponse } from "@dayflow/api-client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { categoryLabel, categoryStyle } from "../events/event-category-values";
import { monthCellItems, monthItemsOn, type MonthItem } from "./calendar-content";
import { dayOfMonth, weekdayKr } from "./calendar-time";

/**
 * 월: the whole month at a glance. Presentation only — no drag, drop or resize (dates are changed in the
 * day / 3-day / week views). Each cell lists a few Events and Days; "+N 더보기" opens that date's day view.
 */
export function MonthGrid({
  dates,
  month,
  today,
  days,
  occurrences,
  dayHref,
  onOpenDay,
  onOpenEvent,
}: {
  dates: string[];
  /** "2026-09": dates of other months are drawn muted. */
  month: string;
  today: string;
  days: readonly DayResponse[];
  occurrences: readonly EventOccurrenceResponse[];
  dayHref: (date: string) => string;
  onOpenDay: (day: DayResponse) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  return (
    <div className="tc-month" role="grid" aria-label="월간 캘린더">
      <div className="tc-month-head" role="row">
        {dates.slice(0, 7).map((date) => (
          <div key={date} className="tc-month-weekday" role="columnheader">
            {weekdayKr(date)}
          </div>
        ))}
      </div>
      <div className="tc-month-body">
        {dates.map((date) => {
          const { shown, hidden } = monthCellItems(monthItemsOn(date, days, occurrences));
          const classes = ["tc-month-cell", date === today ? "today" : "", date.startsWith(month) ? "" : "outside"].filter(Boolean);
          return (
            <div key={date} className={classes.join(" ")} role="gridcell" data-date={date}>
              <Link href={dayHref(date)} className="tc-month-date" aria-label={`${Number(date.slice(5, 7))}월 ${dayOfMonth(date)}일 하루 보기`}>
                {dayOfMonth(date)}
              </Link>
              <div className="tc-month-items">
                {shown.map((item) => (
                  <MonthItemButton key={item.key} item={item} onOpenDay={onOpenDay} onOpenEvent={onOpenEvent} />
                ))}
                {hidden > 0 && (
                  <Link href={dayHref(date)} className="tc-month-more" aria-label={`${hidden}개 더보기`}>
                    +{hidden}
                    <span className="tc-month-more-label"> 더보기</span>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthItemButton({
  item,
  onOpenDay,
  onOpenEvent,
}: {
  item: MonthItem;
  onOpenDay: (day: DayResponse) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  if (item.kind === "event") {
    const { occurrence } = item;
    return (
      <button
        type="button"
        className="tc-month-event"
        style={categoryStyle(occurrence.category) as CSSProperties}
        data-event-id={occurrence.eventId}
        title={`${categoryLabel(occurrence.category)} · ${occurrence.title}`}
        onClick={() => onOpenEvent(occurrence.eventId)}
      >
        <span className="tc-month-dot" aria-hidden />
        {item.timeLabel && <span className="tc-month-time">{item.timeLabel}</span>}
        <span className="tc-month-title">{occurrence.title}</span>
      </button>
    );
  }
  const { day } = item;
  return (
    <button
      type="button"
      className={`tc-month-day${day.status === "DONE" ? " done" : ""}`}
      data-day-id={day.id}
      title={`Day · ${day.title}`}
      onClick={() => onOpenDay(day)}
    >
      <span className="tc-month-check" aria-hidden>
        {day.status === "DONE" ? "✓" : "○"}
      </span>
      {item.timeLabel && <span className="tc-month-time">{item.timeLabel}</span>}
      <span className="tc-month-title">{day.title}</span>
    </button>
  );
}
