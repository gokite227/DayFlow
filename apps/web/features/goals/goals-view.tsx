"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ErrorNotice, LoadingState } from "@/components/query-state";
import { useDays } from "@/features/days/day-queries";
import { useToday } from "@/lib/use-today";
import { GoalFormModal, type GoalFormTarget } from "./goal-form-modal";
import { GoalPeriodListView, GoalWeekView, GoalYearView } from "./goal-overview-views";
import { useGoals } from "./goal-queries";
import { PeriodGoalFormModal } from "./period-goal-form-modal";
import { usePeriodGoals } from "./period-goal-queries";
import { ActivePeriodGoalsSection, PeriodGoalListView } from "./period-goal-views";
import {
  GOALS_VIEWS,
  GOALS_VIEW_LABEL,
  VIEW_GOAL_TYPE,
  goalsViewHref,
  parseGoalsViewState,
  type GoalsViewState,
} from "./goal-views";

/**
 * Goals home (GOAL-005): "진행 중인 목표" (running PERIOD Goals) on top, then the 연간/분기/월간/주간 views and
 * the 기간 view, kept in the URL (no global "전체" view). Clicking a Goal drills down into /goals/[goalId];
 * browser back and "← 목표 목록으로" return to the same view.
 */
export function GoalsView() {
  const today = useToday();
  return (
    <>
      <PageHeader
        title="Goals"
        subtitle="연간 → 분기 → 월간 → 주간까지 목표를 쪼개고, 시험·여행처럼 기간이 정해진 목표는 기간 목표로 관리합니다."
      />
      {today === null ? <LoadingState /> : <GoalsContent today={today} />}
    </>
  );
}

type CreateForm = { kind: "CALENDAR"; target: GoalFormTarget } | { kind: "PERIOD" };

function GoalsContent({ today }: { today: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = parseGoalsViewState(searchParams, today);
  const [form, setForm] = useState<CreateForm | null>(null);
  const goalsQuery = useGoals();
  const periodGoalsQuery = usePeriodGoals();
  const daysQuery = useDays();
  const goals = goalsQuery.data ?? [];
  // Passed down so each Goal card can link back to the exact view the user is in.
  const listHref = goalsViewHref(state, today);

  const calendarTarget = (): GoalFormTarget => {
    const anchor = state.view === "week" ? state.weekStart : today;
    return {
      mode: "create",
      context: null,
      defaultType: state.view === "period" ? "YEAR" : VIEW_GOAL_TYPE[state.view],
      defaultYear: Number(anchor.slice(0, 4)),
      defaultMonth: Number(anchor.slice(5, 7)),
    };
  };
  const openCreate = () => setForm(state.view === "period" ? { kind: "PERIOD" } : { kind: "CALENDAR", target: calendarTarget() });
  const switchKind = (kind: "CALENDAR" | "PERIOD") =>
    setForm(kind === "PERIOD" ? { kind: "PERIOD" } : { kind: "CALENDAR", target: calendarTarget() });

  return (
    <>
      <ActivePeriodGoalsSection query={periodGoalsQuery} days={daysQuery.data} today={today} />

      <div className="goal-tabs-row" style={{ marginTop: 18 }}>
        <nav className="goal-tabs" role="tablist" aria-label="목표 보기">
          {GOALS_VIEWS.map((view) => (
            <Link
              key={view}
              href={goalsViewHref({ ...viewDefaults(state, view), view }, today)}
              replace
              scroll={false}
              role="tab"
              aria-selected={state.view === view}
              className={state.view === view ? "active" : undefined}
            >
              {GOALS_VIEW_LABEL[view]}
            </Link>
          ))}
        </nav>
        <button type="button" className="btn" onClick={openCreate}>
          + 새 목표
        </button>
      </div>

      {state.view === "period" ? (
        periodGoalsQuery.isPending ? (
          <LoadingState label="기간 목표를 불러오는 중…" />
        ) : periodGoalsQuery.isError ? (
          <ErrorNotice error={periodGoalsQuery.error} onRetry={() => void periodGoalsQuery.refetch()} />
        ) : (
          <PeriodGoalListView goals={periodGoalsQuery.data} days={daysQuery.data} today={today} filter={state.status} />
        )
      ) : goalsQuery.isPending ? (
        <LoadingState label="목표를 불러오는 중…" />
      ) : goalsQuery.isError ? (
        <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
      ) : state.view === "year" ? (
        <GoalYearView goals={goals} days={daysQuery.data} listHref={listHref} />
      ) : state.view === "quarter" || state.view === "month" ? (
        <GoalPeriodListView
          type={VIEW_GOAL_TYPE[state.view] as "QUARTER" | "MONTH"}
          goals={goals}
          days={daysQuery.data}
          today={today}
          listHref={listHref}
        />
      ) : (
        <GoalWeekView state={state} goals={goals} days={daysQuery.data} today={today} listHref={listHref} />
      )}

      {form?.kind === "CALENDAR" && (
        <GoalFormModal
          target={form.target}
          goals={goals}
          onClose={() => setForm(null)}
          onSwitchKind={switchKind}
          onCreated={(created) => {
            // A lower-level Goal lands inside its parent so the user sees where it was placed.
            if (created.parentGoalId) router.push(`/goals/${created.parentGoalId}`);
          }}
        />
      )}
      {form?.kind === "PERIOD" && (
        <PeriodGoalFormModal
          target={{ mode: "create" }}
          today={today}
          onSwitchKind={switchKind}
          onClose={() => setForm(null)}
          onCreated={(created) => router.push(`/goals/${created.id}`)}
        />
      )}
    </>
  );
}

/** Switching tabs keeps the week and layout the user chose for the 주간 tab. */
function viewDefaults(state: GoalsViewState, view: GoalsViewState["view"]): Partial<GoalsViewState> {
  return view === "week" ? { layout: state.layout, weekStart: state.weekStart } : {};
}
