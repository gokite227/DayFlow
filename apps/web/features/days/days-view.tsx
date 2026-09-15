"use client";

import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { formatPeriod, sortGoals } from "@/features/goals/goal-tree";
import { useGoals } from "@/features/goals/goal-queries";
import { DayFormModal, type DayFormTarget } from "./day-form-modal";
import { useCreateDay, useDays, useUpdateDay } from "./day-queries";
import {
  DAY_STATUS_LABEL,
  PLANNING_MODE_LABEL,
  describeDaySchedule,
  newDayValues,
  toCreateDayRequest,
  toUpdateDayRequest,
  dayToValues,
} from "./day-values";

export function DaysView() {
  const [goalFilter, setGoalFilter] = useState("");
  const [formTarget, setFormTarget] = useState<DayFormTarget | null>(null);
  const weekGoalsQuery = useGoals({ type: "WEEK" });
  const daysQuery = useDays(goalFilter ? { goalId: goalFilter } : {});
  const updateDay = useUpdateDay();

  const weekGoals = sortGoals(weekGoalsQuery.data ?? []);
  const goalsById = new Map(weekGoals.map((goal) => [goal.id, goal]));

  const toggleDone = (day: DayResponse) =>
    updateDay.mutate({
      dayId: day.id,
      body: toUpdateDayRequest({ ...dayToValues(day), status: day.status === "DONE" ? "NOT_STARTED" : "DONE" }, day.version),
    });

  return (
    <>
      <PageHeader title="Days" subtitle="주간 목표를 실제 하루의 행동으로 바꾸는 실행 단위입니다." />

      <div className="card">
        <div className="toolbar">
          <label className="mini" htmlFor="day-goal-filter">
            주간 목표
          </label>
          <select id="day-goal-filter" value={goalFilter} onChange={(event) => setGoalFilter(event.target.value)}>
            <option value="">전체</option>
            {weekGoals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title} ({formatPeriod(goal)})
              </option>
            ))}
          </select>
          {updateDay.isPending && <span className="mini">저장 중…</span>}
        </div>

        {updateDay.error && (
          <div style={{ marginBottom: 12 }}>
            <ErrorNotice error={updateDay.error} />
          </div>
        )}

        {daysQuery.isPending ? (
          <LoadingState label="Day를 불러오는 중…" />
        ) : daysQuery.isError ? (
          <ErrorNotice error={daysQuery.error} onRetry={() => void daysQuery.refetch()} />
        ) : daysQuery.data.length === 0 ? (
          <EmptyState>아직 Day가 없습니다. 아래에서 주간 목표를 골라 추가해보세요.</EmptyState>
        ) : (
          <div className="day-list">
            {daysQuery.data.map((day) => (
              <DayItem
                key={day.id}
                day={day}
                goal={goalsById.get(day.goalId)}
                toggling={updateDay.isPending && updateDay.variables?.dayId === day.id}
                onToggle={() => toggleDone(day)}
                onOpen={() => {
                  updateDay.reset();
                  setFormTarget({ mode: "edit", day });
                }}
              />
            ))}
          </div>
        )}

        {weekGoalsQuery.isError ? (
          <div style={{ marginTop: 12 }}>
            <ErrorNotice error={weekGoalsQuery.error} onRetry={() => void weekGoalsQuery.refetch()} />
          </div>
        ) : weekGoalsQuery.isSuccess && weekGoals.length === 0 ? (
          <div className="mini" style={{ marginTop: 12 }}>
            Day는 주간 목표 아래에 만듭니다. 먼저 <Link href="/goals">Goals</Link>에서 주간 목표를 만들어주세요.
          </div>
        ) : (
          <QuickAddDay
            weekGoals={weekGoals}
            defaultGoalId={goalFilter}
            onOpenDetail={(goalId) => setFormTarget({ mode: "create", goalId })}
          />
        )}
      </div>

      {formTarget && (
        <DayFormModal target={formTarget} weekGoals={weekGoals} onClose={() => setFormTarget(null)} />
      )}
    </>
  );
}

function DayItem({
  day,
  goal,
  toggling,
  onToggle,
  onOpen,
}: {
  day: DayResponse;
  goal: GoalResponse | undefined;
  toggling: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const done = day.status === "DONE";
  return (
    <div className={`day-item${done ? " done" : ""}`}>
      <input
        type="checkbox"
        checked={done}
        disabled={toggling}
        onChange={onToggle}
        aria-label={`${day.title} 완료`}
      />
      <button type="button" className="day-title" onClick={onOpen}>
        <div>
          <span className="day-title-text">{day.title}</span>
          {day.coreDay && <span className="core-badge">핵심</span>}
        </div>
        <div className="mini">
          {goal?.title ?? "주간 목표"} · {describeDaySchedule(day)} · {DAY_STATUS_LABEL[day.status]} ·{" "}
          {PLANNING_MODE_LABEL[day.planningMode]} · {day.estimatedMinutes}분
        </div>
      </button>
    </div>
  );
}

/** The prototype's one-line add: title + WEEK Goal + optional date, with defaults for the rest. */
function QuickAddDay({
  weekGoals,
  defaultGoalId,
  onOpenDetail,
}: {
  weekGoals: GoalResponse[];
  defaultGoalId: string;
  onOpenDetail: (goalId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const createDay = useCreateDay();

  const selectedGoalId = goalId || defaultGoalId;
  const goal = weekGoals.find((candidate) => candidate.id === selectedGoalId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createDay.mutate(toCreateDayRequest({ ...newDayValues(selectedGoalId, plannedDate), title }), {
      onSuccess: () => {
        setTitle("");
        setPlannedDate("");
      },
    });
  };

  return (
    <form onSubmit={submit}>
      <div className="add-day-line">
        <input
          type="text"
          required
          maxLength={200}
          placeholder="새 Day"
          aria-label="새 Day 제목"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <select
          required
          aria-label="주간 목표"
          value={selectedGoalId}
          onChange={(event) => setGoalId(event.target.value)}
        >
          <option value="">주간 목표 선택</option>
          {weekGoals.map((weekGoal) => (
            <option key={weekGoal.id} value={weekGoal.id}>
              {weekGoal.title}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="실행 날짜 (선택)"
          value={plannedDate}
          min={goal?.startDate}
          max={goal?.endDate}
          onChange={(event) => setPlannedDate(event.target.value)}
        />
        <button type="submit" className="btn" disabled={createDay.isPending}>
          {createDay.isPending ? "추가 중…" : "추가"}
        </button>
        <button type="button" className="btn secondary" onClick={() => onOpenDetail(selectedGoalId)}>
          상세 추가
        </button>
      </div>
      {createDay.error && (
        <div style={{ marginTop: 10 }}>
          <ErrorNotice error={createDay.error} />
        </div>
      )}
    </form>
  );
}
