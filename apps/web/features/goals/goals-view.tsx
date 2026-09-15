"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ErrorNotice, LoadingState } from "@/components/query-state";
import { useDays } from "@/features/days/day-queries";
import { useToday } from "@/lib/use-today";
import { GoalFormModal, type GoalFormTarget } from "./goal-form-modal";
import { GoalFlowView, GoalPeriodListView, GoalWeekView, GoalYearView } from "./goal-overview-views";
import { useGoals } from "./goal-queries";
import {
  GOALS_VIEWS,
  GOALS_VIEW_LABEL,
  VIEW_GOAL_TYPE,
  goalsViewHref,
  parseGoalsViewState,
  type GoalsViewState,
} from "./goal-views";

/**
 * Goals home (GOAL-005): quick view tabs 전체/연간/분기/월간/주간, kept in the URL. Clicking a Goal in any view
 * drills down into /goals/[goalId]; browser back returns to the same view.
 */
export function GoalsView() {
  const today = useToday();
  return (
    <>
      <PageHeader
        title="Goals"
        subtitle="연간 → 분기 → 월간 → 주간까지 목표를 쪼개고, 주간 아래에서 Day를 계획합니다."
      />
      {today === null ? <LoadingState /> : <GoalsContent today={today} />}
    </>
  );
}

function GoalsContent({ today }: { today: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = parseGoalsViewState(searchParams, today);
  const [formTarget, setFormTarget] = useState<GoalFormTarget | null>(null);
  const goalsQuery = useGoals();
  const daysQuery = useDays();
  const goals = goalsQuery.data ?? [];

  const openCreate = () =>
    setFormTarget({
      mode: "create",
      context: null,
      defaultType: VIEW_GOAL_TYPE[state.view],
      defaultYear: Number((state.view === "week" ? state.weekStart : today).slice(0, 4)),
      defaultMonth: Number((state.view === "week" ? state.weekStart : today).slice(5, 7)),
    });

  return (
    <>
      <div className="goal-tabs-row">
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

      {goalsQuery.isPending ? (
        <LoadingState label="목표를 불러오는 중…" />
      ) : goalsQuery.isError ? (
        <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
      ) : state.view === "all" ? (
        <GoalFlowView goals={goals} days={daysQuery.data} today={today} rootId={state.rootId} />
      ) : state.view === "year" ? (
        <GoalYearView goals={goals} days={daysQuery.data} today={today} />
      ) : state.view === "quarter" || state.view === "month" ? (
        <GoalPeriodListView type={VIEW_GOAL_TYPE[state.view] as "QUARTER" | "MONTH"} goals={goals} days={daysQuery.data} today={today} />
      ) : (
        <GoalWeekView state={state} goals={goals} days={daysQuery.data} today={today} />
      )}

      {formTarget && (
        <GoalFormModal
          target={formTarget}
          goals={goals}
          onClose={() => setFormTarget(null)}
          onCreated={(created) => {
            // A lower-level Goal lands inside its parent so the user sees where it was placed.
            if (created.parentGoalId) router.push(`/goals/${created.parentGoalId}`);
          }}
        />
      )}
    </>
  );
}

/** Switching tabs keeps the week and layout the user chose for the 주간 tab. */
function viewDefaults(state: GoalsViewState, view: GoalsViewState["view"]): Partial<GoalsViewState> {
  return view === "week" ? { layout: state.layout, weekStart: state.weekStart } : {};
}
