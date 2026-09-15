"use client";

import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { DayFormModal } from "@/features/days/day-form-modal";
import { useDays } from "@/features/days/day-queries";
import { useToday } from "@/lib/use-today";
import { GoalFormModal, type GoalFormTarget } from "./goal-form-modal";
import { goalPeriodLabel, periodRangeLabel } from "./goal-period";
import { GoalProgress } from "./goal-progress";
import { useDeleteGoal, useGoals } from "./goal-queries";
import { GOAL_TYPE_LABEL, PROGRESS_POLICY_LABEL, childTypeOf, childrenOf, goalPath, sortGoals } from "./goal-tree";
import { WeekGoalDays, WeekLayoutSwitch } from "./goal-week-days";
import { datesOfGoal, type WeekLayout } from "./goal-views";

const CHILD_SECTION_TITLE = { YEAR: "분기 목표", QUARTER: "월간 목표", MONTH: "주간 목표" } as const;

/** One Goal and its direct children (drill-down). A WEEK Goal shows its Days instead. */
export function GoalDetailView({ goalId }: { goalId: string }) {
  const goalsQuery = useGoals();
  const daysQuery = useDays();

  if (goalsQuery.isPending) return <LoadingState label="목표를 불러오는 중…" />;
  if (goalsQuery.isError) {
    return <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />;
  }
  const goals = goalsQuery.data;
  const goal = goals.find((candidate) => candidate.id === goalId);
  if (!goal) {
    return (
      <div className="card">
        <EmptyState>
          목표를 찾을 수 없습니다. 이미 삭제되었을 수 있어요. <Link href="/goals">Goals로 돌아가기</Link>
        </EmptyState>
      </div>
    );
  }
  // key: a different Goal starts with fresh modal state.
  return <GoalDetail key={goal.id} goal={goal} goals={goals} days={daysQuery.data} />;
}

function GoalDetail({
  goal,
  goals,
  days,
}: {
  goal: GoalResponse;
  goals: GoalResponse[];
  days: DayResponse[] | undefined;
}) {
  const router = useRouter();
  const [formTarget, setFormTarget] = useState<GoalFormTarget | null>(null);
  const deleteGoal = useDeleteGoal();
  const path = goalPath(goals, goal);
  const childType = childTypeOf(goal.type);

  const remove = () => {
    if (!window.confirm(`"${goal.title}" 목표를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    deleteGoal.mutate(goal.id, {
      // replace: going back must not return to a deleted Goal.
      onSuccess: () => router.replace(goal.parentGoalId ? `/goals/${goal.parentGoalId}` : "/goals"),
    });
  };

  return (
    <>
      <nav className="breadcrumb" aria-label="목표 경로">
        <Link href="/goals">Goals</Link>
        {path.map((ancestor) => (
          <span key={ancestor.id} className="breadcrumb-step">
            <span aria-hidden>›</span>
            {ancestor.id === goal.id ? (
              <span aria-current="page">
                {goalPeriodLabel(ancestor)} {ancestor.title}
              </span>
            ) : (
              <Link href={`/goals/${ancestor.id}`}>
                {goalPeriodLabel(ancestor)} {ancestor.title}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="stack">
        <section className="card detail-hero">
          <div className="detail-meta">
            <span className="goal-type">{GOAL_TYPE_LABEL[goal.type]}</span>
            <span className="period-badge">{goalPeriodLabel(goal, goal.type !== "YEAR")}</span>
            <span className="pill">{periodRangeLabel(goal)}</span>
          </div>
          <div className="detail-title">{goal.title}</div>
          {goal.why && <div className="goal-why">Why · {goal.why}</div>}
          <div className="detail-progress">
            <GoalProgress goal={goal} goals={goals} days={days} />
          </div>
          <div className="mini">
            우선순위 {goal.priority} · {PROGRESS_POLICY_LABEL[goal.progressPolicy]}
          </div>
          {deleteGoal.error && (
            <div style={{ marginTop: 12 }}>
              <ErrorNotice error={deleteGoal.error} />
            </div>
          )}
          <div className="card-actions">
            {goal.type === "YEAR" && (
              <Link href={`/goals?view=all&root=${goal.id}`} className="btn ghost small">
                전체 흐름 보기
              </Link>
            )}
            <button type="button" className="btn ghost small" onClick={() => setFormTarget({ mode: "edit", goal })}>
              수정
            </button>
            <button type="button" className="btn danger small" onClick={remove} disabled={deleteGoal.isPending}>
              {deleteGoal.isPending ? "삭제 중…" : "삭제"}
            </button>
          </div>
        </section>

        {goal.type === "WEEK" ? (
          <WeekDays goal={goal} goals={goals} />
        ) : (
          <ChildGoals goal={goal} goals={goals} days={days} onAdd={() => setFormTarget({ mode: "create", context: goal, defaultYear: Number(goal.startDate.slice(0, 4)) })} childLabel={childType ? GOAL_TYPE_LABEL[childType] : ""} />
        )}
      </div>

      {formTarget && <GoalFormModal target={formTarget} goals={goals} onClose={() => setFormTarget(null)} />}
    </>
  );
}

function ChildGoals({
  goal,
  goals,
  days,
  childLabel,
  onAdd,
}: {
  goal: GoalResponse;
  goals: GoalResponse[];
  days: DayResponse[] | undefined;
  childLabel: string;
  onAdd: () => void;
}) {
  const children = childrenOf(goals, goal.id);
  const title = goal.type === "WEEK" ? "" : CHILD_SECTION_TITLE[goal.type];
  return (
    <section className="card">
      <div className="goal-header-row">
        <div>
          <strong>{title}</strong>
          <div className="mini">현재 목표 안에서 바로 다음 단계 목표를 만들고, 눌러서 들어갑니다.</div>
        </div>
        <button type="button" className="btn small" onClick={onAdd}>
          + {childLabel}
        </button>
      </div>
      {children.length === 0 ? (
        <EmptyState>아직 {title}가 없습니다.</EmptyState>
      ) : (
        <div className="subgoal-grid">
          {children.map((child) => (
            <Link key={child.id} href={`/goals/${child.id}`} className="subgoal-card" data-goal-id={child.id}>
              <div className="goal-card-meta">
                <span className="period-badge">{goalPeriodLabel(child)}</span>
                <span className="mini">우선순위 {child.priority}</span>
              </div>
              <strong className="subgoal-title">{child.title}</strong>
              <div className="goal-period">{periodRangeLabel(child)}</div>
              <GoalProgress goal={child} goals={goals} days={days} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** prototype WEEK detail: "이번 주 Days" with 주간 뷰 (board by date) / 리스트 뷰, kept in ?layout=. */
function WeekDays({ goal, goals }: { goal: GoalResponse; goals: GoalResponse[] }) {
  const today = useToday();
  const searchParams = useSearchParams();
  const layout: WeekLayout = searchParams.get("layout") === "list" ? "list" : "week";
  const daysQuery = useDays({ goalId: goal.id });
  const [creating, setCreating] = useState(false);

  return (
    <section className="card">
      <div className="goal-header-row">
        <div>
          <strong>이번 주 Days</strong>
          <div className="mini">
            {layout === "week"
              ? "Day를 클릭하면 날짜와 시간을 바로 수정할 수 있습니다."
              : "이 주간 목표에 연결된 Day를 날짜 순으로 봅니다."}
          </div>
        </div>
        <div className="card-actions" style={{ marginTop: 0 }}>
          <WeekLayoutSwitch layout={layout} hrefFor={(next) => `/goals/${goal.id}?layout=${next}`} />
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            + Day
          </button>
        </div>
      </div>
      {daysQuery.isPending || today === null ? (
        <LoadingState label="Day를 불러오는 중…" />
      ) : daysQuery.isError ? (
        <ErrorNotice error={daysQuery.error} onRetry={() => void daysQuery.refetch()} />
      ) : (
        <WeekGoalDays
          layout={layout}
          dates={datesOfGoal(goal)}
          weekGoals={[goal]}
          goals={goals}
          days={daysQuery.data}
          today={today}
        />
      )}
      {creating && (
        <DayFormModal
          target={{ mode: "create", goalId: goal.id }}
          weekGoals={sortGoals(goals.filter((candidate) => candidate.type === "WEEK"))}
          onClose={() => setCreating(false)}
        />
      )}
    </section>
  );
}
