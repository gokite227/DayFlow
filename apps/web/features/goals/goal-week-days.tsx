"use client";

import type { DayResponse, CalendarGoalResponse as GoalResponse } from "@dayflow/api-client";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorNotice } from "@/components/query-state";
import { weekdayShort } from "@/features/calendar/calendar-time";
import { DayFormModal } from "@/features/days/day-form-modal";
import { useUpdateDay } from "@/features/days/day-queries";
import { DAY_STATUS_LABEL, describeDaySchedule, doneToggleRequest } from "@/features/days/day-values";
import { goalPeriodLabel } from "./goal-period";
import { sortGoals } from "./goal-tree";
import { WEEK_LAYOUTS, WEEK_LAYOUT_LABEL, type WeekLayout } from "./goal-views";

const WEEKDAY_KR: Record<string, string> = { MON: "월", TUE: "화", WED: "수", THU: "목", FRI: "금", SAT: "토", SUN: "일" };

/** prototype `.day-view-switch`: 주간 뷰 / 리스트 뷰. Each option is a link so the choice lives in the URL. */
export function WeekLayoutSwitch({ layout, hrefFor }: { layout: WeekLayout; hrefFor: (layout: WeekLayout) => string }) {
  return (
    <div className="day-view-switch" role="tablist" aria-label="주간 표시 방식">
      {WEEK_LAYOUTS.map((value) => (
        <Link
          key={value}
          href={hrefFor(value)}
          replace
          scroll={false}
          role="tab"
          aria-selected={layout === value}
          className={layout === value ? "active" : undefined}
        >
          {WEEK_LAYOUT_LABEL[value]}
        </Link>
      ))}
    </div>
  );
}

/**
 * Days of WEEK Goals: a Mon–Sun board by date plus undated Days (prototype weekDayBoard), or a date-ordered
 * list (prototype weekDayList). Used by the Goals 주간 view and the WEEK Goal detail; this is not the Calendar.
 */
export function WeekGoalDays({
  layout,
  dates,
  weekGoals,
  goals,
  days,
  today,
}: {
  layout: WeekLayout;
  dates: string[];
  weekGoals: GoalResponse[];
  goals: GoalResponse[];
  days: DayResponse[];
  today: string;
}) {
  const [editingDay, setEditingDay] = useState<DayResponse | null>(null);
  const updateDay = useUpdateDay();
  const goalIds = new Set(weekGoals.map((goal) => goal.id));
  const goalById = new Map(weekGoals.map((goal) => [goal.id, goal]));
  // Only Days linked to these WEEK Goals; Days without a Goal belong to Days/Today (DAY-001).
  const linked = days
    .filter((day) => day.goalId !== null && goalIds.has(day.goalId))
    .sort((a, b) => (a.plannedDate ?? "9999").localeCompare(b.plannedDate ?? "9999") || a.title.localeCompare(b.title));
  const showGoal = weekGoals.length > 1;

  const dayCard = (day: DayResponse) => {
    const goal = day.goalId === null ? undefined : goalById.get(day.goalId);
    return (
      <div key={day.id} className={`day-item board-day${day.status === "DONE" ? " done" : ""}`} data-day-id={day.id}>
        <input
          type="checkbox"
          checked={day.status === "DONE"}
          disabled={updateDay.isPending && updateDay.variables?.dayId === day.id}
          onChange={() => updateDay.mutate({ dayId: day.id, body: doneToggleRequest(day) })}
          aria-label={`${day.title} 완료`}
        />
        <button type="button" className="day-title" onClick={() => setEditingDay(day)}>
          <span className="day-title-text">{day.title}</span>
          {showGoal && goal && <span className="mini board-day-goal">{goalPeriodLabel(goal)}</span>}
        </button>
      </div>
    );
  };

  return (
    <>
      {updateDay.error && (
        <div style={{ marginBottom: 12 }}>
          <ErrorNotice error={updateDay.error} />
        </div>
      )}

      {layout === "week" ? (
        <>
          <div className="week-board">
            {dates.map((date) => {
              const dated = linked.filter((day) => day.plannedDate === date);
              return (
                <div
                  key={date}
                  className={`week-day-col${date === today ? " today" : ""}${dated.length ? "" : " empty"}`}
                  data-date={date}
                >
                  <div className="week-day-head">
                    <span className="week-day-name">{WEEKDAY_KR[weekdayShort(date)]}</span>
                    <span className="week-day-date">{date.slice(5)}</span>
                  </div>
                  <div className="week-day-items">
                    {dated.length ? dated.map(dayCard) : <div className="mini">비어 있음</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="unscheduled-box">
            <div className="section-label">날짜 미정</div>
            <div className="day-list">
              {linked.filter((day) => day.plannedDate === null).map(dayCard)}
              {!linked.some((day) => day.plannedDate === null) && <div className="mini">미정 Day가 없습니다.</div>}
            </div>
          </div>
        </>
      ) : linked.length === 0 ? (
        <EmptyState>아직 Day가 없습니다.</EmptyState>
      ) : (
        <div className="day-list-view">
          {linked.map((day) => (
            <button
              key={day.id}
              type="button"
              className={`day-list-row${day.status === "DONE" ? " done" : ""}`}
              onClick={() => setEditingDay(day)}
              data-day-id={day.id}
            >
              <span className="day-list-date">{day.plannedDate ?? "날짜 미정"}</span>
              <span>
                <strong>{day.title}</strong>
                <span className="mini" style={{ display: "block" }}>
                  {DAY_STATUS_LABEL[day.status]}
                  {showGoal && day.goalId !== null && goalById.has(day.goalId)
                    ? ` · ${goalPeriodLabel(goalById.get(day.goalId)!)}`
                    : ""}
                </span>
              </span>
              <span className="day-list-schedule">{describeDaySchedule(day).split(" · ")[1] ?? "날짜 미정"}</span>
              <span className="day-list-status">{day.status === "DONE" ? "✓ 완료" : "열어서 수정 →"}</span>
            </button>
          ))}
        </div>
      )}

      {editingDay && (
        <DayFormModal
          target={{ mode: "edit", day: editingDay }}
          weekGoals={sortGoals(goals.filter((goal) => goal.type === "WEEK"))}
          onClose={() => setEditingDay(null)}
        />
      )}
    </>
  );
}
