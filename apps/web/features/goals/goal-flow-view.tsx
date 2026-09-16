"use client";

import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import Link from "next/link";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { useDays } from "@/features/days/day-queries";
import { useToday } from "@/lib/use-today";
import { goalPeriodLabel } from "./goal-period";
import { GoalProgress } from "./goal-progress";
import { useGoals } from "./goal-queries";
import { goalFlows, isCurrentGoal } from "./goal-views";

const STAGES = [
  { key: "quarters", label: "분기 목표" },
  { key: "months", label: "월간 목표" },
  { key: "weeks", label: "주간 목표" },
] as const;

/**
 * GOAL-006 "전체 흐름 보기": one YEAR Goal's YEAR → QUARTER → MONTH → WEEK flow on a single screen
 * (prototype Goal 전체 흐름). Not a global Goals view, and not a recursive tree: each level is one stage,
 * and every card links into the normal drill-down detail.
 */
export function GoalFlowView({ goalId }: { goalId: string }) {
  const today = useToday();
  const goalsQuery = useGoals();
  const daysQuery = useDays();

  if (goalsQuery.isPending || today === null) return <LoadingState label="목표를 불러오는 중…" />;
  if (goalsQuery.isError) {
    return <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />;
  }
  const goals = goalsQuery.data;
  const goal = goals.find((candidate) => candidate.id === goalId);
  if (!goal || goal.type !== "YEAR") {
    return (
      <div className="card">
        <EmptyState>
          연간 목표에서만 전체 흐름을 볼 수 있습니다. <Link href="/goals?view=year">연간 목표로 돌아가기</Link>
        </EmptyState>
      </div>
    );
  }
  return <YearFlow year={goal} goals={goals} days={daysQuery.data} today={today} />;
}

function YearFlow({
  year,
  goals,
  days,
  today,
}: {
  year: GoalResponse;
  goals: GoalResponse[];
  days: DayResponse[] | undefined;
  today: string;
}) {
  const flow = goalFlows(goals, year.id)[0]!;

  return (
    <>
      <nav className="breadcrumb" aria-label="목표 경로">
        <Link href="/goals?view=year">Goals</Link>
        <span className="breadcrumb-step">
          <span aria-hidden>›</span>
          <Link href={`/goals/${year.id}`}>
            {goalPeriodLabel(year)} {year.title}
          </Link>
        </span>
        <span className="breadcrumb-step">
          <span aria-hidden>›</span>
          <span aria-current="page">전체 흐름</span>
        </span>
      </nav>

      <section className="card flow-root" data-flow-year={year.id}>
        <div className="flow-top-actions">
          <div>
            <span className="period-badge">{goalPeriodLabel(year)}</span>
            <h2 className="flow-year-title">{year.title}</h2>
            {year.why && <div className="mini">{year.why}</div>}
          </div>
          <Link href={`/goals/${year.id}`} className="btn ghost small">
            목표 상세
          </Link>
        </div>
        <GoalProgress goal={year} goals={goals} days={days} />

        <div className="flow-stages">
          {STAGES.map((stage) => {
            const items = flow[stage.key];
            return (
              <div key={stage.key} className="flow-stage" data-stage={stage.key}>
                <div className="flow-stage-label">
                  <span aria-hidden>↓</span> {stage.label}
                </div>
                {items.length === 0 ? (
                  <div className="mini flow-empty">아직 {stage.label}가 없습니다.</div>
                ) : (
                  <div className="flow-stage-items">
                    {items.map((item) => {
                      const parent = goals.find((candidate) => candidate.id === item.parentGoalId);
                      return (
                        <Link
                          key={item.id}
                          href={`/goals/${item.id}`}
                          className={`flow-goal${isCurrentGoal(item, today) ? " current" : ""}`}
                          data-goal-id={item.id}
                        >
                          <span className="flow-goal-period">{goalPeriodLabel(item)}</span>
                          <span className="flow-goal-title">{item.title}</span>
                          {parent && stage.key !== "quarters" && (
                            <span className="flow-goal-parent">
                              › {goalPeriodLabel(parent)} {parent.title}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
