"use client";

import type { EventOccurrenceResponse, EventResponse, EventType } from "@dayflow/api-client";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { addDays } from "@/features/calendar/calendar-time";
import { useGoals } from "@/features/goals/goal-queries";
import { useToday } from "@/lib/use-today";
import { EventFormModal, type EventFormTarget } from "./event-form-modal";
import { useEventOccurrences, useEvents } from "./event-queries";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  RECURRENCE_LABEL,
  describeOccurrenceTime,
  eventTime,
  nextOccurrences,
  reminderLabel,
  shortDate,
} from "./event-values";

/** Upcoming = the next occurrence of each Event within a year (the API range limit is 366 days). */
const UPCOMING_DAYS = 365;

type Filter = "ALL" | EventType;

export function EventsView() {
  const today = useToday();
  const [target, setTarget] = useState<EventFormTarget | null>(null);

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="면접·시험·생일·마감처럼 이미 정해진 일정을 따로 관리합니다."
        action={
          today && (
            <button type="button" className="btn" onClick={() => setTarget({ mode: "create", date: today })}>
              + 새 일정
            </button>
          )
        }
      />
      {today === null ? <LoadingState /> : <EventsContent today={today} onOpen={setTarget} />}
      {target && <EventFormModal target={target} onClose={() => setTarget(null)} />}
    </>
  );
}

function EventsContent({ today, onOpen }: { today: string; onOpen: (target: EventFormTarget) => void }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const occurrencesQuery = useEventOccurrences(today, addDays(today, UPCOMING_DAYS));
  const eventsQuery = useEvents();
  const goalsQuery = useGoals();

  const goalTitle = new Map((goalsQuery.data ?? []).map((goal) => [goal.id, goal.title]));
  const eventsById = new Map((eventsQuery.data ?? []).map((event) => [event.id, event]));
  const matches = (type: EventType) => filter === "ALL" || filter === type;

  const upcoming = nextOccurrences(occurrencesQuery.data ?? []).filter((occurrence) => matches(occurrence.type));
  const upcomingIds = new Set((occurrencesQuery.data ?? []).map((occurrence) => occurrence.eventId));
  // Events without an occurrence in the upcoming year: already over, or further than a year ahead.
  const others = (eventsQuery.data ?? []).filter((event) => !upcomingIds.has(event.id) && matches(event.type));

  const countFor = (value: Filter) =>
    nextOccurrences(occurrencesQuery.data ?? []).filter((occurrence) => value === "ALL" || occurrence.type === value)
      .length;

  return (
    <div className="stack">
      <div className="goal-tabs" role="tablist" aria-label="일정 유형">
        {(["ALL", ...EVENT_TYPES] as Filter[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "active" : undefined}
            onClick={() => setFilter(value)}
          >
            {value === "ALL" ? "전체" : EVENT_TYPE_LABEL[value]}
            {occurrencesQuery.isSuccess && <span className="tab-count">{countFor(value)}</span>}
          </button>
        ))}
      </div>

      <section className="card">
        <h3 className="card-title">다가오는 일정</h3>
        {occurrencesQuery.isPending ? (
          <LoadingState label="일정을 불러오는 중…" />
        ) : occurrencesQuery.isError ? (
          <ErrorNotice error={occurrencesQuery.error} onRetry={() => void occurrencesQuery.refetch()} />
        ) : upcoming.length === 0 ? (
          <EmptyState>
            {filter === "ALL" ? "앞으로 1년 안에 예정된 일정이 없습니다." : `다가오는 ${EVENT_TYPE_LABEL[filter]} 일정이 없습니다.`}
          </EmptyState>
        ) : (
          <div className="event-list">
            {upcoming.map((occurrence) => (
              <UpcomingRow
                key={occurrence.eventId}
                occurrence={occurrence}
                event={eventsById.get(occurrence.eventId)}
                goalTitle={occurrence.linkedGoalId ? goalTitle.get(occurrence.linkedGoalId) : undefined}
                onOpen={() => onOpen({ mode: "edit", eventId: occurrence.eventId })}
              />
            ))}
          </div>
        )}
      </section>

      {others.length > 0 && (
        <section className="card">
          <h3 className="card-title">그 밖의 일정</h3>
          <div className="mini" style={{ marginBottom: 10 }}>
            이미 지난 일정이거나 1년 뒤에 있는 일정이에요.
          </div>
          <div className="event-list">
            {others.map((event) => (
              <OtherRow
                key={event.id}
                event={event}
                today={today}
                onOpen={() => onOpen({ mode: "edit", eventId: event.id })}
              />
            ))}
          </div>
        </section>
      )}
      {eventsQuery.isError && <ErrorNotice error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()} />}
    </div>
  );
}

function UpcomingRow({
  occurrence,
  event,
  goalTitle,
  onOpen,
}: {
  occurrence: EventOccurrenceResponse;
  event: EventResponse | undefined;
  goalTitle: string | undefined;
  onOpen: () => void;
}) {
  const details = [
    occurrence.recurrence !== "NONE" ? RECURRENCE_LABEL[occurrence.recurrence] : null,
    occurrence.location,
    event && event.reminders.length > 0 ? `알림 ${event.reminders.map(reminderLabel).join(", ")}` : null,
    goalTitle ? `목표: ${goalTitle}` : null,
  ].filter((detail): detail is string => detail !== null);

  return (
    <button type="button" className={`event-row type-${occurrence.type.toLowerCase()}`} onClick={onOpen}>
      <span className="event-type-badge">{EVENT_TYPE_LABEL[occurrence.type]}</span>
      <span className="event-row-main">
        <strong>{occurrence.title}</strong>
        <span className="event-row-time">{describeOccurrenceTime(occurrence)}</span>
        {details.length > 0 && <span className="mini">{details.join(" · ")}</span>}
      </span>
      <span className="event-row-edit">수정 →</span>
    </button>
  );
}

function OtherRow({ event, today, onOpen }: { event: EventResponse; today: string; onOpen: () => void }) {
  const time = eventTime(event);
  const date = time.allDay ? time.startDate : time.startAt.slice(0, 10);
  return (
    <button
      type="button"
      className={`event-row${date < today ? " past" : ""} type-${event.type.toLowerCase()}`}
      onClick={onOpen}
    >
      <span className="event-type-badge">{EVENT_TYPE_LABEL[event.type]}</span>
      <span className="event-row-main">
        <strong>{event.title}</strong>
        <span className="event-row-time">
          {time.allDay ? `${shortDate(date)} · 하루 종일` : shortDate(date)}
        </span>
      </span>
      <span className="event-row-edit">수정 →</span>
    </button>
  );
}
