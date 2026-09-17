"use client";

import type { DayResponse, CalendarGoalResponse as GoalResponse, GoalResponse as AnyGoalResponse } from "@dayflow/api-client";
import { usePeriodGoals } from "@/features/goals/period-goal-queries";
import { dayGoalLink } from "@/features/goals/period-goal-values";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { formatKoreanDate } from "@/features/calendar/calendar-time";
import { DayFormModal } from "@/features/days/day-form-modal";
import { DayItem } from "@/features/days/day-item";
import { useDays, useUpdateDay } from "@/features/days/day-queries";
import { doneToggleRequest } from "@/features/days/day-values";
import { useGoals } from "@/features/goals/goal-queries";
import { GOAL_TYPE_LABEL, goalPath, sortGoals } from "@/features/goals/goal-tree";
import { shortDate } from "@/features/recovery/recovery-plan";
import { TodayCoachCard } from "./today-coach-card";
import { TodayWeekGoals } from "./today-goals";
import { useRecoveryCandidates, useRecoveryDays } from "@/features/recovery/recovery-queries";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData } from "@/lib/api-error";
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
  // Progress counts every Day of a Goal, not only today's, so the whole list is needed.
  const allDaysQuery = useDays();
  const updateDay = useUpdateDay();

  const periodGoalsQuery = usePeriodGoals();
  const goals = goalsQuery.data ?? [];
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  // Day rows link to either kind of Goal; the Goal path below stays the CALENDAR hierarchy.
  const anyGoalsById = new Map<string, AnyGoalResponse>([...goals, ...(periodGoalsQuery.data ?? [])].map((goal) => [goal.id, goal]));
  // Core Days first; no ranking by time or completion.
  const days = [...(daysQuery.data ?? [])].sort((a, b) => Number(b.coreDay) - Number(a.coreDay));
  const weekGoals = sortGoals(goals.filter((goal) => goal.type === "WEEK"));

  // Coach suggestions can point at earlier Days too; those are loaded on demand for the same Day editor.
  const openDayById = async (dayId: string) => {
    updateDay.reset();
    const loaded =
      days.find((day) => day.id === dayId) ??
      (await expectData(getDayFlowApiClient().GET("/api/v1/days/{dayId}", { params: { path: { dayId } } })));
    setEditingDay(loaded);
  };

  // Paths of the WEEK Goals behind today's Days (Days without a Goal have no path, DAY-001);
  // without such Days, the WEEK Goals covering today.
  const linkedGoalIds = [...new Set(days.map((day) => day.goalId))].filter(
    // PERIOD Goals have no hierarchy path; their Days show the Goal link on the row instead.
    (goalId): goalId is string => goalId !== null && goalsById.has(goalId),
  );
  const pathGoals = linkedGoalIds.length
    ? linkedGoalIds
        .map((goalId) => goalsById.get(goalId))
        .filter((goal): goal is GoalResponse => goal !== undefined)
    : weekGoals.filter((goal) => goal.startDate <= today && today <= goal.endDate);

  return (
    <div className="stack">
      <RecoveryEntry today={today} />

      <TodayCoachCard today={today} onOpenDay={openDayById} />

      <TodayWeekGoals today={today} goalsQuery={goalsQuery} days={allDaysQuery.data} />

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
                goal={dayGoalLink(day, anyGoalsById)}
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

/**
 * Recovery entry: shown when there are missed plans (REC-001: past open Days and today's Days whose time
 * has passed, minus the ones already handled in the same planning state, REC-005), or when today is a
 * Recovery Day.
 */
function RecoveryEntry({ today }: { today: string }) {
  const candidatesQuery = useRecoveryCandidates(today);
  const recoveryQuery = useRecoveryDays(today, today);
  const missedCount = candidatesQuery.data?.length ?? 0;
  const hasMissed = missedCount > 0;
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
            <strong>놓친 계획이 있어요</strong> · {missedCount}개를 오늘 기준으로 다시 정리할 수 있어요.
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
