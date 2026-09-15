"use client";

import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { addDays, formatKoreanDate } from "@/features/calendar/calendar-time";
import { DayFormModal } from "@/features/days/day-form-modal";
import { DayItem } from "@/features/days/day-item";
import { useDays, useUpdateDay } from "@/features/days/day-queries";
import { doneToggleRequest } from "@/features/days/day-values";
import { useGoals } from "@/features/goals/goal-queries";
import { GOAL_TYPE_LABEL, goalPath, sortGoals } from "@/features/goals/goal-tree";
import { shortDate } from "@/features/recovery/recovery-plan";
import { useRecoveryDays } from "@/features/recovery/recovery-queries";
import { isOpen } from "@/features/review/review-summary";
import { useToday } from "@/lib/use-today";

export function TodayView() {
  const today = useToday();

  return (
    <>
      <PageHeader
        title="Today"
        subtitle="오늘의 Day가 어떤 주간·월간·연간 목표와 연결되는지 확인합니다."
        action={today && <span className="pill">{formatKoreanDate(today)}</span>}
      />
      {today === null ? <LoadingState /> : <TodayContent today={today} />}
    </>
  );
}

function TodayContent({ today }: { today: string }) {
  const [editingDay, setEditingDay] = useState<DayResponse | null>(null);
  const daysQuery = useDays({ from: today, to: today });
  const goalsQuery = useGoals();
  const updateDay = useUpdateDay();

  const goals = goalsQuery.data ?? [];
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  // Core Days first; no ranking by time or completion.
  const days = [...(daysQuery.data ?? [])].sort((a, b) => Number(b.coreDay) - Number(a.coreDay));
  const weekGoals = sortGoals(goals.filter((goal) => goal.type === "WEEK"));

  // Paths of the WEEK Goals behind today's Days; without Days, the WEEK Goals covering today.
  const pathGoals = days.length
    ? [...new Set(days.map((day) => day.goalId))]
        .map((goalId) => goalsById.get(goalId))
        .filter((goal): goal is GoalResponse => goal !== undefined)
    : weekGoals.filter((goal) => goal.startDate <= today && today <= goal.endDate);

  return (
    <div className="stack">
      <RecoveryEntry today={today} />

      <section className="card">
        <h3 className="card-title">Current Goal Path</h3>
        {goalsQuery.isPending ? (
          <LoadingState label="목표를 불러오는 중…" />
        ) : goalsQuery.isError ? (
          <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
        ) : pathGoals.length === 0 ? (
          <EmptyState>
            오늘과 연결된 주간 목표가 없습니다. <Link href="/goals">Goals</Link>에서 이번 주 목표를 만들어보세요.
          </EmptyState>
        ) : (
          <div className="stack">
            {pathGoals.map((weekGoal) => (
              <GoalPath key={weekGoal.id} path={goalPath(goals, weekGoal)} />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">Today&apos;s Days</h3>
        {updateDay.error && (
          <div style={{ marginBottom: 12 }}>
            <ErrorNotice error={updateDay.error} />
          </div>
        )}
        {daysQuery.isPending ? (
          <LoadingState label="오늘의 Day를 불러오는 중…" />
        ) : daysQuery.isError ? (
          <ErrorNotice error={daysQuery.error} onRetry={() => void daysQuery.refetch()} />
        ) : days.length === 0 ? (
          <EmptyState>
            오늘 계획된 Day가 없습니다. <Link href="/days">Days</Link>나 <Link href="/calendar">Calendar</Link>에서
            오늘 할 일을 정해보세요.
          </EmptyState>
        ) : (
          <div className="day-list">
            {days.map((day) => (
              <DayItem
                key={day.id}
                day={day}
                goalTitle={goalsById.get(day.goalId)?.title}
                highlightCore
                toggling={updateDay.isPending && updateDay.variables?.dayId === day.id}
                onToggle={() => updateDay.mutate({ dayId: day.id, body: doneToggleRequest(day) })}
                onOpen={() => {
                  updateDay.reset();
                  setEditingDay(day);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {editingDay && (
        <DayFormModal
          target={{ mode: "edit", day: editingDay }}
          weekGoals={weekGoals}
          onClose={() => setEditingDay(null)}
        />
      )}
    </div>
  );
}

/** Recovery entry: shown only when a past Day is still open, or when today is a Recovery Day. */
function RecoveryEntry({ today }: { today: string }) {
  const pastDaysQuery = useDays({ to: addDays(today, -1) });
  const recoveryQuery = useRecoveryDays(today, today);
  const hasMissed = (pastDaysQuery.data ?? []).some(isOpen);
  const recoveryDay = recoveryQuery.data?.[0];

  if (!hasMissed && !recoveryDay) return null;
  return (
    <>
      {recoveryDay && (
        <div className="recovery-banner" role="status">
          <span>
            <strong>오늘은 Recovery Day예요.</strong>
            {recoveryDay.returnDate ? ` ${shortDate(recoveryDay.returnDate)}에 다시 평소 계획으로 돌아와요.` : " 천천히 회복해요."}
          </span>
          <Link href="/recovery" className="btn ghost small">
            Recovery Day 보기
          </Link>
        </div>
      )}
      {hasMissed && (
        <div className="recovery-banner">
          <span>
            <strong>놓친 계획이 있어요</strong> · 오늘 기준으로 다시 정리할 수 있어요.
          </span>
          <Link href="/recovery" className="btn ghost small">
            다시 정리하기
          </Link>
        </div>
      )}
    </>
  );
}

function GoalPath({ path }: { path: GoalResponse[] }) {
  return (
    <div className="goal-path-rows">
      {path.map((goal) => (
        <div key={goal.id} className="goal-path-row">
          <div className="goal-path-label">{GOAL_TYPE_LABEL[goal.type]}</div>
          <Link href="/goals" className="goal-path-box">
            <strong>{goal.title}</strong>
            {goal.why && <div className="mini">{goal.why}</div>}
          </Link>
        </div>
      ))}
    </div>
  );
}
