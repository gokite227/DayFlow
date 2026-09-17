"use client";

import type { DayResponse, EventOccurrenceResponse, GoalResponse } from "@dayflow/api-client";
import { usePeriodGoals } from "@/features/goals/period-goal-queries";
import { dayDateProblem } from "@/features/goals/period-goal-values";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { DayFormModal } from "@/features/days/day-form-modal";
import { useDays, useDeleteDaySchedule, useSetDaySchedule, useUpdateDay } from "@/features/days/day-queries";
import { DAY_STATUS_LABEL, describeDaySchedule } from "@/features/days/day-values";
import { EventFormModal } from "@/features/events/event-form-modal";
import { useEventCategories } from "@/features/events/event-category-queries";
import { useEventOccurrences } from "@/features/events/event-queries";
import { UNCATEGORIZED_LABEL, categoryLabel, categoryStyle, sortCategories } from "@/features/events/event-category-values";
import { describeOccurrenceTime } from "@/features/events/event-values";
import { useGoals } from "@/features/goals/goal-queries";
import { sortGoals } from "@/features/goals/goal-tree";
import { useNowMinutes, useToday } from "@/lib/use-today";
import { calendarContentItems, hasEventsInMonth } from "./calendar-content";
import { dropTargetDate, planDrop, type DropTarget } from "./calendar-drop";
import {
  CALENDAR_CONTENTS,
  CALENDAR_CONTENT_LABEL,
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABEL,
  calendarHref,
  calendarRangeLabel,
  monthEnd,
  monthStart,
  parseCalendarViewState,
  shiftCalendarDate,
  viewDates,
  type CalendarViewState,
} from "./calendar-range";
import { koreanShortDate, minutesOfDay, scheduleRequest, wallClock } from "./calendar-time";
import { MonthGrid } from "./month-grid";
import { UnscheduledPanel } from "./unscheduled-panel";
import { useUnscheduledCollapsed } from "./use-panel-preference";
import { HOUR_HEIGHT, WeekGrid, type DayDragData } from "./week-grid";

/** Hours shown above "now" when scrolling to the current time. */
const NOW_SCROLL_OFFSET_HOURS = 2;

/**
 * Date-only cells and the Unscheduled panel sit on top of (or beside) the partly hidden time
 * columns, so they win whenever the pointer is inside them.
 */
const collisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  const preferred = collisions.filter((collision) => !String(collision.id).startsWith("time:"));
  return preferred.length > 0 ? preferred : collisions;
};

export function CalendarView() {
  const today = useToday();
  // View, reference date, content and Category live in the URL: a refresh, a browser back or a deep link
  // (a Goal period, GOAL-007; the Events screen) opens the same Calendar.
  const searchParams = useSearchParams();
  if (today === null) return <LoadingState />;
  return <CalendarContent today={today} state={parseCalendarViewState(searchParams, today)} />;
}

function CalendarContent({ today, state }: { today: string; state: CalendarViewState }) {
  const router = useRouter();
  const [unscheduledCollapsed, toggleUnscheduled] = useUnscheduledCollapsed();
  const [editingDay, setEditingDay] = useState<DayResponse | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [draggingDay, setDraggingDay] = useState<DayResponse | null>(null);
  const lastDragEndedAt = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nowMinutes = useNowMinutes();

  const eventsOnly = state.content === "events";
  const timeGrid = state.view === "day" || state.view === "3day" || state.view === "week";
  const dates = viewDates(state);
  const rangeStart = dates[0]!;
  const rangeEnd = dates[dates.length - 1]!;
  const rangeDaysQuery = useDays({ from: rangeStart, to: rangeEnd });
  // Events are a separate domain and query; they are drawn with the Days but never dragged.
  const occurrencesQuery = useEventOccurrences(rangeStart, rangeEnd);
  // The API has no "no date" filter, so Unscheduled is derived from the full list.
  const allDaysQuery = useDays();
  const weekGoalsQuery = useGoals({ type: "WEEK" });
  const periodGoalsQuery = usePeriodGoals();
  const categoriesQuery = useEventCategories();
  const setSchedule = useSetDaySchedule();
  const deleteSchedule = useDeleteDaySchedule();
  const updateDay = useUpdateDay();
  // A drop the Day's Goal cannot take is refused before any request, so the block simply stays where it was.
  const [dropProblem, setDropProblem] = useState<string | null>(null);
  const goalOfDay = (day: DayResponse): GoalResponse | undefined =>
    day.goalId === null
      ? undefined
      : [...(weekGoalsQuery.data ?? []), ...(periodGoalsQuery.data ?? [])].find((goal) => goal.id === day.goalId);

  // 일정만 removes the Days from the data, so they cannot be dragged, dropped, resized or take lanes.
  const shown = calendarContentItems(rangeDaysQuery.data ?? [], occurrencesQuery.data ?? [], state.content, state.category);
  const categories = sortCategories(categoriesQuery.data ?? []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const pending = setSchedule.isPending || deleteSchedule.isPending || updateDay.isPending;
  const mutationError = setSchedule.error ?? deleteSchedule.error ?? updateDay.error;
  const unscheduledDays = (allDaysQuery.data ?? []).filter((day) => day.plannedDate === null);

  const scrollToNow = () => {
    if (scrollRef.current) {
      const hours = Math.max(minutesOfDay(new Date()) / 60 - NOW_SCROLL_OFFSET_HOURS, 0);
      scrollRef.current.scrollTop = hours * HOUR_HEIGHT;
    }
  };

  // Scroll near the current time once when the grid first appears; later scrolling is left to the user.
  const gridReady = rangeDaysQuery.isSuccess && timeGrid;
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (gridReady && !didInitialScroll.current) {
      didInitialScroll.current = true;
      scrollToNow();
    }
  });

  const resetMutations = () => {
    setDropProblem(null);
    setSchedule.reset();
    deleteSchedule.reset();
    updateDay.reset();
  };

  const openDay = (day: DayResponse) => {
    // A drop can be followed by a click on the same element; ignore it.
    if (Date.now() - lastDragEndedAt.current < 300) return;
    resetMutations();
    setEditingDay(day);
  };

  const openEvent = (eventId: string) => {
    if (Date.now() - lastDragEndedAt.current < 300) return;
    setEditingEventId(eventId);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    // Previous notices are cleared on drop, not here: removing them now would shift the grid under the pointer.
    setDraggingDay((active.data.current as DayDragData | undefined)?.day ?? null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDragEndedAt.current = Date.now();
    setDraggingDay(null);
    resetMutations();
    // Nothing can be dragged in 일정만; a drag that was running while the mode changed changes nothing.
    if (eventsOnly) return;
    const day = (active.data.current as DayDragData | undefined)?.day;
    const target = over?.data.current as DropTarget | undefined;
    const draggedTop = active.rect.current.translated?.top;
    if (!day || !target || !over || draggedTop === undefined) return;

    const action = planDrop(day, target, draggedTop - over.rect.top, HOUR_HEIGHT);
    if (action === null) return;
    const problem = dayDateProblem(goalOfDay(day), dropTargetDate(action) ?? null);
    if (problem) {
      setDropProblem(problem);
      return;
    }

    switch (action.type) {
      case "setSchedule":
        // expectedVersion: null for a new schedule, the current version when moving one.
        setSchedule.mutate({
          dayId: day.id,
          body: scheduleRequest(action.date, action.startMinutes, action.lengthMinutes, day.schedule),
        });
        break;
      case "unschedule":
        deleteSchedule.mutate(day.id, {
          onSuccess: () => {
            if (action.moveToDate) {
              updateDay.mutate({ dayId: day.id, body: { plannedDate: action.moveToDate, version: day.version } });
            }
          },
        });
        break;
      case "moveDate":
        updateDay.mutate({ dayId: day.id, body: { plannedDate: action.date, version: day.version } });
        break;
    }
  };

  const resize = (day: DayResponse, lengthMinutes: number) => {
    if (!day.schedule || eventsOnly) return;
    resetMutations();
    const start = wallClock(day.schedule.startAt);
    setSchedule.mutate({
      dayId: day.id,
      body: scheduleRequest(start.date, start.minutes, lengthMinutes, day.schedule),
    });
  };

  const hrefFor = (next: Partial<CalendarViewState>) => calendarHref({ ...state, ...next }, today);
  // Navigation replaces the URL so the browser back button leaves the Calendar instead of walking weeks.
  const goTo = (next: Partial<CalendarViewState>) => router.replace(hrefFor(next), { scroll: false });

  const goToToday = () => {
    goTo({ date: today });
    scrollToNow();
  };

  const monthHasNoEvents =
    state.view === "month" && eventsOnly && occurrencesQuery.isSuccess && !hasEventsInMonth(shown.occurrences, monthStart(state.date), monthEnd(state.date));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={false}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className={`tc-layout${eventsOnly ? " no-panel" : unscheduledCollapsed ? " panel-collapsed" : ""}`}>
        <section className="tc-main" aria-label="캘린더">
          <div className="tc-toolbar">
            <div className="tc-nav">
              <button
                type="button"
                className="tc-icon-btn"
                aria-label="이전 기간"
                onClick={() => goTo({ date: shiftCalendarDate(state, -1) })}
              >
                ‹
              </button>
              <h1 className="tc-range">{calendarRangeLabel(state)}</h1>
              <button
                type="button"
                className="tc-icon-btn"
                aria-label="다음 기간"
                onClick={() => goTo({ date: shiftCalendarDate(state, 1) })}
              >
                ›
              </button>
              <button type="button" className="tc-today-btn" onClick={goToToday}>
                오늘
              </button>
            </div>
            <div className="tc-controls">
              {pending && <span className="tc-saving">저장 중…</span>}
              <div className="day-view-switch" role="tablist" aria-label="기간 보기">
                {CALENDAR_VIEWS.map((value) => (
                  <Link
                    key={value}
                    href={hrefFor({ view: value })}
                    replace
                    scroll={false}
                    role="tab"
                    aria-selected={state.view === value}
                    className={state.view === value ? "active" : undefined}
                  >
                    {CALENDAR_VIEW_LABEL[value]}
                  </Link>
                ))}
              </div>
              <div className="day-view-switch" role="tablist" aria-label="표시 내용">
                {CALENDAR_CONTENTS.map((value) => (
                  <Link
                    key={value}
                    href={hrefFor({ content: value })}
                    replace
                    scroll={false}
                    role="tab"
                    aria-selected={state.content === value}
                    className={state.content === value ? "active" : undefined}
                  >
                    {CALENDAR_CONTENT_LABEL[value]}
                  </Link>
                ))}
              </div>
              <select
                className="tc-category-select"
                aria-label="일정 카테고리"
                value={state.category ?? ""}
                onChange={(event) => goTo({ category: event.target.value === "" ? null : event.target.value })}
              >
                <option value="">모든 일정</option>
                <option value="UNCATEGORIZED">{UNCATEGORIZED_LABEL}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {dropProblem && (
            <div className="tc-notice">
              <div className="notice error" role="alert">
                {dropProblem} 날짜를 바꾸지 않았어요.
              </div>
            </div>
          )}
          {mutationError && (
            <div className="tc-notice">
              <ErrorNotice error={mutationError} />
            </div>
          )}

          {occurrencesQuery.isError && (
            <div className="tc-notice">
              <ErrorNotice error={occurrencesQuery.error} onRetry={() => void occurrencesQuery.refetch()} />
            </div>
          )}
          {monthHasNoEvents && <div className="tc-month-empty">이 달에 일정이 없어요.</div>}

          {rangeDaysQuery.isError ? (
            <ErrorNotice error={rangeDaysQuery.error} onRetry={() => void rangeDaysQuery.refetch()} />
          ) : state.view === "list" ? (
            rangeDaysQuery.isPending ? (
              <LoadingState />
            ) : (
              <CalendarList days={shown.days} occurrences={shown.occurrences} eventsOnly={eventsOnly} onOpen={openDay} onOpenEvent={openEvent} />
            )
          ) : state.view === "month" ? (
            <MonthGrid
              dates={dates}
              month={state.date.slice(0, 7)}
              today={today}
              days={shown.days}
              occurrences={shown.occurrences}
              dayHref={(date) => hrefFor({ view: "day", date })}
              onOpenDay={openDay}
              onOpenEvent={openEvent}
            />
          ) : (
            <div className="tc-scroll-x" aria-busy={rangeDaysQuery.isPending}>
              <WeekGrid
                dates={dates}
                today={today}
                nowMinutes={nowMinutes}
                days={shown.days}
                occurrences={shown.occurrences}
                disabled={pending || rangeDaysQuery.isPending || eventsOnly}
                scrollRef={scrollRef}
                onOpen={openDay}
                onOpenEvent={openEvent}
                onResize={resize}
              />
            </div>
          )}
        </section>

        {/* 일정만 has no Day at all, so no panel and no toggle; the saved open/closed choice stays for 전체. */}
        {!eventsOnly && (
          <UnscheduledPanel
            days={unscheduledDays}
            loading={allDaysQuery.isPending}
            error={allDaysQuery.error}
            onRetry={() => void allDaysQuery.refetch()}
            // The month view has no drop targets: its Days are opened, not dragged.
            disabled={pending || state.view === "month" || state.view === "list"}
            collapsed={unscheduledCollapsed}
            onToggle={toggleUnscheduled}
            onOpen={openDay}
          />
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingDay && !eventsOnly && <div className="tc-drag-preview">{draggingDay.title}</div>}
      </DragOverlay>

      {editingDay && (
        <DayFormModal
          target={{ mode: "edit", day: editingDay }}
          weekGoals={sortGoals(weekGoalsQuery.data ?? [])}
          onClose={() => setEditingDay(null)}
        />
      )}

      {editingEventId && (
        <EventFormModal target={{ mode: "edit", eventId: editingEventId }} onClose={() => setEditingEventId(null)} />
      )}
    </DndContext>
  );
}

/** Prototype list view: the week's Events, then (in 전체) the dated Days in date/time order. */
function CalendarList({
  days,
  occurrences,
  eventsOnly,
  onOpen,
  onOpenEvent,
}: {
  days: DayResponse[];
  occurrences: EventOccurrenceResponse[];
  eventsOnly: boolean;
  onOpen: (day: DayResponse) => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const eventRows = occurrences.map((occurrence, index) => (
    <button
      key={`${occurrence.eventId}:${index}`}
      type="button"
      className="day-list-row event"
      style={categoryStyle(occurrence.category) as CSSProperties}
      data-event-id={occurrence.eventId}
      onClick={() => onOpenEvent(occurrence.eventId)}
    >
      <span className="day-list-date">{categoryLabel(occurrence.category)}</span>
      <span>
        <strong>{occurrence.title}</strong>
      </span>
      <span className="day-list-schedule">{describeOccurrenceTime(occurrence, koreanShortDate)}</span>
      <span className="day-list-status">일정 수정 →</span>
    </button>
  ));
  if (eventsOnly) {
    return (
      <div className="day-list-view">
        {eventRows}
        {occurrences.length === 0 && <EmptyState>이 주에 일정이 없어요.</EmptyState>}
      </div>
    );
  }
  if (days.length === 0) {
    return (
      <div className="day-list-view">
        {eventRows}
        <EmptyState>이 주에 날짜가 정해진 Day가 없습니다.</EmptyState>
      </div>
    );
  }
  const sorted = [...days].sort(
    (a, b) =>
      (a.plannedDate ?? "").localeCompare(b.plannedDate ?? "") ||
      (a.schedule?.startAt ?? "~").localeCompare(b.schedule?.startAt ?? "~"),
  );
  return (
    <div className="day-list-view">
      {eventRows}
      {sorted.map((day) => (
        <button
          key={day.id}
          type="button"
          className={`day-list-row${day.status === "DONE" ? " done" : ""}`}
          data-day-id={day.id}
          onClick={() => onOpen(day)}
        >
          <span className="day-list-date">{day.plannedDate}</span>
          <span>
            <strong>{day.title}</strong>
            {day.coreDay && <span className="core-badge">핵심</span>}
            <span className="mini" style={{ display: "block" }}>
              {DAY_STATUS_LABEL[day.status]}
            </span>
          </span>
          <span className="day-list-schedule">{describeDaySchedule(day).split(" · ")[1]}</span>
          <span className="day-list-status">열어서 수정 →</span>
        </button>
      ))}
    </div>
  );
}
