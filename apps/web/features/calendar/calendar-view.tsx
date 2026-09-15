"use client";

import type { DayResponse } from "@dayflow/api-client";
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
import { useEffect, useRef, useState } from "react";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { DayFormModal } from "@/features/days/day-form-modal";
import { useDays, useDeleteDaySchedule, useSetDaySchedule, useUpdateDay } from "@/features/days/day-queries";
import { DAY_STATUS_LABEL, describeDaySchedule } from "@/features/days/day-values";
import { useGoals } from "@/features/goals/goal-queries";
import { sortGoals } from "@/features/goals/goal-tree";
import { useNowMinutes, useToday } from "@/lib/use-today";
import { planDrop, type DropTarget } from "./calendar-drop";
import {
  addDays,
  formatWeekRange,
  minutesOfDay,
  scheduleRequest,
  startOfWeek,
  wallClock,
  weekDates,
} from "./calendar-time";
import { UnscheduledPanel } from "./unscheduled-panel";
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
  return today === null ? <LoadingState /> : <CalendarContent today={today} />;
}

function CalendarContent({ today }: { today: string }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [mode, setMode] = useState<"week" | "list">("week");
  const [editingDay, setEditingDay] = useState<DayResponse | null>(null);
  const [draggingDay, setDraggingDay] = useState<DayResponse | null>(null);
  const lastDragEndedAt = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nowMinutes = useNowMinutes();

  const dates = weekDates(weekStart);
  const weekDaysQuery = useDays({ from: dates[0], to: dates[6] });
  // The API has no "no date" filter, so Unscheduled is derived from the full list.
  const allDaysQuery = useDays();
  const weekGoalsQuery = useGoals({ type: "WEEK" });
  const setSchedule = useSetDaySchedule();
  const deleteSchedule = useDeleteDaySchedule();
  const updateDay = useUpdateDay();

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
  const gridReady = weekDaysQuery.isSuccess;
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (gridReady && !didInitialScroll.current) {
      didInitialScroll.current = true;
      scrollToNow();
    }
  });

  const resetMutations = () => {
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

  const onDragStart = ({ active }: DragStartEvent) => {
    // Previous notices are cleared on drop, not here: removing them now would shift the grid under the pointer.
    setDraggingDay((active.data.current as DayDragData | undefined)?.day ?? null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDragEndedAt.current = Date.now();
    setDraggingDay(null);
    resetMutations();
    const day = (active.data.current as DayDragData | undefined)?.day;
    const target = over?.data.current as DropTarget | undefined;
    const draggedTop = active.rect.current.translated?.top;
    if (!day || !target || !over || draggedTop === undefined) return;

    const action = planDrop(day, target, draggedTop - over.rect.top, HOUR_HEIGHT);
    if (action === null) return;

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
    if (!day.schedule) return;
    resetMutations();
    const start = wallClock(day.schedule.startAt);
    setSchedule.mutate({
      dayId: day.id,
      body: scheduleRequest(start.date, start.minutes, lengthMinutes, day.schedule),
    });
  };

  const goToToday = () => {
    setWeekStart(startOfWeek(today));
    scrollToNow();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      autoScroll={false}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="tc-layout">
        <UnscheduledPanel
          days={unscheduledDays}
          loading={allDaysQuery.isPending}
          error={allDaysQuery.error}
          onRetry={() => void allDaysQuery.refetch()}
          disabled={pending}
          onOpen={openDay}
        />

        <section className="tc-main" aria-label="Week calendar">
          <div className="tc-toolbar">
            <div className="tc-nav">
              <button
                type="button"
                className="tc-icon-btn"
                aria-label="이전 주"
                onClick={() => setWeekStart((start) => addDays(start, -7))}
              >
                ‹
              </button>
              <h1 className="tc-range">{formatWeekRange(dates)}</h1>
              <button
                type="button"
                className="tc-icon-btn"
                aria-label="다음 주"
                onClick={() => setWeekStart((start) => addDays(start, 7))}
              >
                ›
              </button>
            </div>
            <div className="tc-nav">
              {pending && <span className="tc-saving">저장 중…</span>}
              <button type="button" className="tc-today-btn" onClick={goToToday}>
                Today
              </button>
              <div className="day-view-switch" role="tablist" aria-label="보기 방식">
                {(["week", "list"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={mode === value}
                    className={mode === value ? "active" : undefined}
                    onClick={() => setMode(value)}
                  >
                    {value === "week" ? "Week" : "List"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {mutationError && (
            <div className="tc-notice">
              <ErrorNotice error={mutationError} />
            </div>
          )}

          {weekDaysQuery.isError ? (
            <ErrorNotice error={weekDaysQuery.error} onRetry={() => void weekDaysQuery.refetch()} />
          ) : mode === "list" ? (
            weekDaysQuery.isPending ? (
              <LoadingState />
            ) : (
              <CalendarList days={weekDaysQuery.data} onOpen={openDay} />
            )
          ) : (
            <div className="tc-scroll-x" aria-busy={weekDaysQuery.isPending}>
              <WeekGrid
                dates={dates}
                today={today}
                nowMinutes={nowMinutes}
                days={weekDaysQuery.data ?? []}
                disabled={pending || weekDaysQuery.isPending}
                scrollRef={scrollRef}
                onOpen={openDay}
                onResize={resize}
              />
            </div>
          )}
        </section>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingDay && <div className="tc-drag-preview">{draggingDay.title}</div>}
      </DragOverlay>

      {editingDay && (
        <DayFormModal
          target={{ mode: "edit", day: editingDay }}
          weekGoals={sortGoals(weekGoalsQuery.data ?? [])}
          onClose={() => setEditingDay(null)}
        />
      )}
    </DndContext>
  );
}

/** Prototype list view: the week's dated Days in date/time order. */
function CalendarList({ days, onOpen }: { days: DayResponse[]; onOpen: (day: DayResponse) => void }) {
  if (days.length === 0) {
    return <EmptyState>이 주에 날짜가 정해진 Day가 없습니다.</EmptyState>;
  }
  const sorted = [...days].sort(
    (a, b) =>
      (a.plannedDate ?? "").localeCompare(b.plannedDate ?? "") ||
      (a.schedule?.startAt ?? "~").localeCompare(b.schedule?.startAt ?? "~"),
  );
  return (
    <div className="day-list-view">
      {sorted.map((day) => (
        <button
          key={day.id}
          type="button"
          className={`day-list-row${day.status === "DONE" ? " done" : ""}`}
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
