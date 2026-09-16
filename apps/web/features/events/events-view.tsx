"use client";

import type { EventOccurrenceResponse, EventResponse } from "@dayflow/api-client";
import { useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { addDays } from "@/features/calendar/calendar-time";
import { useGoals } from "@/features/goals/goal-queries";
import { useToday } from "@/lib/use-today";
import { EventCategoryManager } from "./event-category-manager";
import { useEventCategories } from "./event-category-queries";
import {
  UNCATEGORIZED_LABEL,
  categoryLabel,
  categoryStyle,
  matchesCategoryFilter,
  sortCategories,
  type EventCategoryFilter,
} from "./event-category-values";
import { EventFormModal, type EventFormTarget } from "./event-form-modal";
import { useEventOccurrences, useEvents } from "./event-queries";
import {
  RECURRENCE_LABEL,
  describeOccurrenceTime,
  eventTime,
  nextOccurrences,
  reminderLabel,
  shortDate,
} from "./event-values";

/** Upcoming = the next occurrence of each Event within a year (the API range limit is 366 days). */
const UPCOMING_DAYS = 365;

export function EventsView() {
  const today = useToday();
  const [target, setTarget] = useState<EventFormTarget | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="면접·시험·생일·마감처럼 이미 정해진 일정을 따로 관리합니다."
        action={
          <div className="event-header-actions">
            <button type="button" className="btn secondary" onClick={() => setManagingCategories(true)}>
              카테고리 관리
            </button>
            {today && (
              <button type="button" className="btn" onClick={() => setTarget({ mode: "create", date: today })}>
                + 새 일정
              </button>
            )}
          </div>
        }
      />
      {today === null ? <LoadingState /> : <EventsContent today={today} onOpen={setTarget} />}
      {target && <EventFormModal target={target} onClose={() => setTarget(null)} />}
      {managingCategories && <EventCategoryManager onClose={() => setManagingCategories(false)} />}
    </>
  );
}

function EventsContent({ today, onOpen }: { today: string; onOpen: (target: EventFormTarget) => void }) {
  const [selectedFilter, setFilter] = useState<EventCategoryFilter>("ALL");
  const occurrencesQuery = useEventOccurrences(today, addDays(today, UPCOMING_DAYS));
  const eventsQuery = useEvents();
  const goalsQuery = useGoals();
  const categoriesQuery = useEventCategories();
  const categories = sortCategories(categoriesQuery.data ?? []);
  // A Category deleted in the manager falls back to 전체 instead of an empty list.
  const filter =
    typeof selectedFilter === "object" && !categories.some((category) => category.id === selectedFilter.categoryId)
      ? "ALL"
      : selectedFilter;
  const filters: { key: string; value: EventCategoryFilter; label: string; color?: string }[] = [
    { key: "ALL", value: "ALL", label: "전체" },
    { key: "UNCATEGORIZED", value: "UNCATEGORIZED", label: UNCATEGORIZED_LABEL },
    ...categories.map((category) => ({
      key: category.id,
      value: { categoryId: category.id },
      label: category.name,
      color: category.color,
    })),
  ];
  const filterKey = (value: EventCategoryFilter) => (typeof value === "object" ? value.categoryId : value);
  const activeFilter = filters.find((entry) => entry.key === filterKey(filter));

  const goalTitle = new Map((goalsQuery.data ?? []).map((goal) => [goal.id, goal.title]));
  const eventsById = new Map((eventsQuery.data ?? []).map((event) => [event.id, event]));
  const upcoming = nextOccurrences(occurrencesQuery.data ?? []).filter((occurrence) =>
    matchesCategoryFilter(occurrence.category, filter),
  );
  const upcomingIds = new Set((occurrencesQuery.data ?? []).map((occurrence) => occurrence.eventId));
  // Events without an occurrence in the upcoming year: already over, or further than a year ahead.
  const others = (eventsQuery.data ?? []).filter(
    (event) => !upcomingIds.has(event.id) && matchesCategoryFilter(event.category, filter),
  );

  const countFor = (value: EventCategoryFilter) =>
    nextOccurrences(occurrencesQuery.data ?? []).filter((occurrence) => matchesCategoryFilter(occurrence.category, value))
      .length;

  return (
    <div className="stack">
      <div className="goal-tabs" role="tablist" aria-label="일정 카테고리">
        {filters.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={entry.key === activeFilter?.key}
            className={entry.key === activeFilter?.key ? "active" : undefined}
            onClick={() => setFilter(entry.value)}
          >
            {entry.color && <span className="tag-dot" aria-hidden style={{ background: entry.color, marginRight: 5 }} />}
            {entry.label}
            {occurrencesQuery.isSuccess && <span className="tab-count">{countFor(entry.value)}</span>}
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
            {filter === "ALL" ? "앞으로 1년 안에 예정된 일정이 없습니다." : `다가오는 ${activeFilter?.label ?? ""} 일정이 없습니다.`}
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
    <button
      type="button"
      className="event-row"
      style={categoryStyle(occurrence.category) as CSSProperties}
      onClick={onOpen}
    >
      <span className="event-type-badge">{categoryLabel(occurrence.category)}</span>
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
      className={`event-row${date < today ? " past" : ""}`}
      style={categoryStyle(event.category) as CSSProperties}
      onClick={onOpen}
    >
      <span className="event-type-badge">{categoryLabel(event.category)}</span>
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
