"use client";

import type { DayResponse, CalendarGoalResponse as GoalResponse } from "@dayflow/api-client";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { goalPeriodLabel } from "@/features/goals/goal-period";
import { GoalProgress } from "@/features/goals/goal-progress";
import { goalContext, isCurrentGoal } from "@/features/goals/goal-views";
import type { UseQueryResult } from "@tanstack/react-query";

/** Compact list first shows this many WEEK Goals; the rest are behind "+N개 더 보기". */
const COMPACT_COUNT = 3;

/**
 * TODAY-001: progress of every WEEK Goal whose period contains today, even when no Day of that Goal is
 * planned for today. Progress itself stays the Goal-linked-Day calculation (GOAL-003).
 */
export function TodayWeekGoals({
  today,
  goalsQuery,
  days,
}: {
  today: string;
  goalsQuery: UseQueryResult<GoalResponse[]>;
  days: DayResponse[] | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const goals = goalsQuery.data ?? [];
  const weekGoals = goals
    .filter((goal) => goal.type === "WEEK" && isCurrentGoal(goal, today))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
  const shown = expanded ? weekGoals : weekGoals.slice(0, COMPACT_COUNT);
  const hidden = weekGoals.length - shown.length;

  return (
    <section className="card">
      <h3 className="card-title">이번 주 목표 진행률</h3>
      {goalsQuery.isPending ? (
        <LoadingState label="목표를 불러오는 중…" />
      ) : goalsQuery.isError ? (
        <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
      ) : weekGoals.length === 0 ? (
        <EmptyState>
          오늘이 포함된 주간 목표가 없습니다. <Link href="/goals?view=week">Goals</Link>에서 이번 주 목표를 만들어보세요.
        </EmptyState>
      ) : (
        <>
          <div className="today-goal-list">
            {shown.map((goal) => (
              <Link key={goal.id} href={`/goals/${goal.id}`} className="today-goal-row" data-goal-id={goal.id}>
                <span className="today-goal-main">
                  <span className="period-badge">{goalPeriodLabel(goal, true)}</span>
                  <span className="today-goal-title">{goal.title}</span>
                  <span className="mini">{goalContext(goals, goal)}</span>
                </span>
                <span className="today-goal-progress">
                  <GoalProgress goal={goal} goals={goals} days={days} />
                </span>
              </Link>
            ))}
          </div>
          {hidden > 0 && (
            <button type="button" className="btn ghost small" onClick={() => setExpanded(true)}>
              +{hidden}개 더 보기
            </button>
          )}
          {expanded && weekGoals.length > COMPACT_COUNT && (
            <button type="button" className="btn ghost small" onClick={() => setExpanded(false)}>
              접기
            </button>
          )}
        </>
      )}
    </section>
  );
}
