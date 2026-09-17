"use client";

import type { DayResponse, PeriodGoalResponse } from "@dayflow/api-client";
import { periodGoalStatus } from "@dayflow/domain";
import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { periodRangeLabel } from "./goal-period";
import {
  PERIOD_FILTERS,
  PERIOD_FILTER_LABEL,
  PERIOD_STATUS_LABEL,
  filterPeriodGoals,
  periodCountLabel,
  periodGoalsHref,
  periodProgressLabel,
  summarizePeriodGoal,
  type PeriodGoalFilter,
} from "./period-goal-values";

export type GoalKindChoice = "CALENDAR" | "PERIOD";

/** "목표 유형" at the top of the global create form: the level-based plan Goal or a free date range. */
export function GoalKindSwitch({ kind, onChange }: { kind: GoalKindChoice; onChange: (kind: GoalKindChoice) => void }) {
  return (
    <div className="field wide">
      <span className="field-label">목표 유형</span>
      <div className="day-view-switch" role="radiogroup" aria-label="목표 유형">
        {(["CALENDAR", "PERIOD"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            className={kind === value ? "active" : undefined}
            onClick={() => onChange(value)}
          >
            {value === "CALENDAR" ? "계획 목표 (연간·분기·월간·주간)" : "기간 목표 (시작일~종료일)"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PeriodStatusBadge({ goal, today }: { goal: PeriodGoalResponse; today: string }) {
  const status = periodGoalStatus(goal, today);
  return <span className={`status-badge ${status.toLowerCase()}`}>{PERIOD_STATUS_LABEL[status]}</span>;
}

/** Day-completion progress of one PERIOD Goal: rate, bar and "완료 n / m". */
export function PeriodGoalProgress({ goal, days }: { goal: PeriodGoalResponse; days: readonly DayResponse[] | undefined }) {
  if (days === undefined) return <div className="mini">진행률 계산 중…</div>;
  const summary = summarizePeriodGoal(days, goal.id);
  return (
    <>
      <div className="progress-line" title={periodCountLabel(summary)}>
        <div className="progress">
          <span style={{ width: `${Math.round((summary.completionRate ?? 0) * 100)}%` }} />
        </div>
        <strong className="progress-value">{periodProgressLabel(summary)}</strong>
      </div>
      <div className="mini">{periodCountLabel(summary)}</div>
    </>
  );
}

export function PeriodGoalCard({
  goal,
  days,
  today,
}: {
  goal: PeriodGoalResponse;
  days: readonly DayResponse[] | undefined;
  today: string;
}) {
  return (
    <Link
      href={`/goals/${goal.id}`}
      className={`period-goal-card${periodGoalStatus(goal, today) === "ACTIVE" ? " current" : ""}`}
      data-goal-id={goal.id}
    >
      <div className="goal-card-meta">
        <span className="goal-type">기간 목표</span>
        <PeriodStatusBadge goal={goal} today={today} />
      </div>
      <h3 className="period-goal-title">{goal.title}</h3>
      <div className="goal-period">{periodRangeLabel(goal)}</div>
      <PeriodGoalProgress goal={goal} days={days} />
    </Link>
  );
}

/** Top of Goals: the PERIOD Goals running today, above the CALENDAR level tabs. */
export function ActivePeriodGoalsSection({
  query,
  days,
  today,
}: {
  query: UseQueryResult<PeriodGoalResponse[]>;
  days: readonly DayResponse[] | undefined;
  today: string;
}) {
  const active = filterPeriodGoals(query.data ?? [], "ACTIVE", today);
  return (
    <section className="card period-active-section" aria-label="진행 중인 목표">
      <div className="goal-header-row">
        <div>
          <strong>진행 중인 목표</strong>
          <div className="mini">시작일과 종료일을 정한 기간 목표 중 오늘 진행 중인 목표예요.</div>
        </div>
        <Link href={periodGoalsHref()} className="btn ghost small">
          기간 목표 전체 보기
        </Link>
      </div>
      {query.isPending ? (
        <LoadingState label="기간 목표를 불러오는 중…" />
      ) : query.isError ? (
        <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />
      ) : active.length === 0 ? (
        <EmptyState>
          {(query.data ?? []).length === 0 ? "아직 기간 목표가 없어요." : "진행 중인 기간 목표가 없어요."}
        </EmptyState>
      ) : (
        <div className="period-list">
          {active.map((goal) => (
            <PeriodGoalCard key={goal.id} goal={goal} days={days} today={today} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 기간 tab: every PERIOD Goal (진행 중 → 예정 → 종료) with a status filter kept in the URL. */
export function PeriodGoalListView({
  goals,
  days,
  today,
  filter,
}: {
  goals: readonly PeriodGoalResponse[];
  days: readonly DayResponse[] | undefined;
  today: string;
  filter: PeriodGoalFilter;
}) {
  const shown = filterPeriodGoals(goals, filter, today);
  return (
    <div className="stack">
      <div className="day-view-switch" role="tablist" aria-label="기간 목표 상태">
        {PERIOD_FILTERS.map((value) => (
          <Link
            key={value}
            href={periodGoalsHref(value)}
            replace
            scroll={false}
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "active" : undefined}
          >
            {PERIOD_FILTER_LABEL[value]}
          </Link>
        ))}
      </div>
      {goals.length === 0 ? (
        <EmptyState>아직 기간 목표가 없어요. + 새 목표에서 기간 목표를 만들어보세요.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>
          {filter === "ACTIVE" ? "진행 중인 기간 목표가 없어요." : `${PERIOD_FILTER_LABEL[filter]} 기간 목표가 없어요.`}
        </EmptyState>
      ) : (
        <div className="period-list">
          {shown.map((goal) => (
            <PeriodGoalCard key={goal.id} goal={goal} days={days} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}
