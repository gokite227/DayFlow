"use client";

import { isPeriodGoalResponse, type DayResponse, type CalendarGoalResponse as GoalResponse } from "@dayflow/api-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { DayFormModal } from "@/features/days/day-form-modal";
import { useDays } from "@/features/days/day-queries";
import { ApiError } from "@/lib/api-error";
import { useToday } from "@/lib/use-today";
import { GoalFormModal, type GoalFormTarget } from "./goal-form-modal";
import { PeriodGoalDetail } from "./period-goal-detail";
import { useGoal } from "./period-goal-queries";
import { goalPeriodLabel, periodRangeLabel } from "./goal-period";
import { GoalProgress } from "./goal-progress";
import { useDeleteGoal, useGoals } from "./goal-queries";
import { GOAL_TYPE_LABEL, PROGRESS_POLICY_LABEL, childTypeOf, childrenOf, goalPath, sortGoals } from "./goal-tree";
import { WeekGoalDays, WeekLayoutSwitch } from "./goal-week-days";
import { PlanningCoachCard } from "./planning-coach-card";
import { backToGoalsHref, datesOfGoal, goalCalendarHref, goalDetailHref, type WeekLayout } from "./goal-views";

const CHILD_SECTION_TITLE = { YEAR: "분기 목표", QUARTER: "월간 목표", MONTH: "주간 목표" } as const;

/**
 * One Goal. A CALENDAR Goal shows its direct children (drill-down) or, for WEEK, its Days; a PERIOD Goal
 * shows its range, status and linked Days. The Goal itself is loaded by id, so a refresh keeps the page and
 * another user's (or a deleted) Goal ends in the same "not found" state.
 */
export function GoalDetailView({ goalId }: { goalId: string }) {
  const goalQuery = useGoal(goalId);
  const goalsQuery = useGoals();
  const daysQuery = useDays();
  const today = useToday();
  const searchParams = useSearchParams();

  if (goalQuery.isPending || (goalQuery.data?.kind !== "PERIOD" && goalsQuery.isPending)) {
    return <LoadingState label="목표를 불러오는 중…" />;
  }
  if (goalQuery.isError && !(goalQuery.error instanceof ApiError && goalQuery.error.status === 404)) {
    return <ErrorNotice error={goalQuery.error} onRetry={() => void goalQuery.refetch()} />;
  }
  if (goalQuery.data && isPeriodGoalResponse(goalQuery.data)) {
    if (today === null) return <LoadingState />;
    const back = searchParams.get("back");
    return (
      <PeriodGoalDetail
        key={goalQuery.data.id}
        goal={goalQuery.data}
        today={today}
        backHref={back ? backToGoalsHref(back, "YEAR") : null}
      />
    );
  }
  if (goalsQuery.isError) {
    return <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />;
  }
  const goals = goalsQuery.data ?? [];
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
  return (
    <GoalDetail
      key={goal.id}
      goal={goal}
      goals={goals}
      days={daysQuery.data}
      today={today}
      backHref={backToGoalsHref(searchParams.get("back"), goal.type)}
    />
  );
}

function GoalDetail({
  goal,
  goals,
  days,
  today,
  backHref,
}: {
  goal: GoalResponse;
  goals: GoalResponse[];
  days: DayResponse[] | undefined;
  today: string | null;
  /** Returns to the Goals view the user came from (GOAL-005). */
  backHref: string;
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
      onSuccess: () => router.replace(goal.parentGoalId ? `/goals/${goal.parentGoalId}` : backHref),
    });
  };

  return (
    <>
      <div className="detail-back">
        <Link href={backHref} className="btn ghost small">
          ← 목표 목록으로
        </Link>
      </div>

      <nav className="breadcrumb" aria-label="목표 경로">
        <Link href={backHref}>Goals</Link>
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
            <PeriodBadge goal={goal} today={today} />
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
              <Link href={`/goals/${goal.id}/flow`} className="btn ghost small">
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
          <ChildGoals
            goal={goal}
            goals={goals}
            days={days}
            backHref={backHref}
            onAdd={() => setFormTarget({ mode: "create", context: goal, defaultYear: Number(goal.startDate.slice(0, 4)) })}
            childLabel={childType ? GOAL_TYPE_LABEL[childType] : ""}
          />
        )}
      </div>

      {formTarget && <GoalFormModal target={formTarget} goals={goals} onClose={() => setFormTarget(null)} />}
    </>
  );
}

/**
 * GOAL-007: MONTH/WEEK period labels open the Calendar at that period (WEEK → its start, MONTH → today when
 * we are inside that month, otherwise its first day). Other types stay plain text.
 */
function PeriodBadge({ goal, today }: { goal: GoalResponse; today: string | null }) {
  const label = goalPeriodLabel(goal, goal.type !== "YEAR");
  const href = today === null ? null : goalCalendarHref(goal, today);
  if (href === null) return <span className="period-badge">{label}</span>;
  return (
    <Link href={href} className="period-badge period-badge-link" title="이 기간의 Calendar 열기" data-calendar-href={href}>
      {label} <span aria-hidden>📅</span>
    </Link>
  );
}

function ChildGoals({
  goal,
  goals,
  days,
  backHref,
  childLabel,
  onAdd,
}: {
  goal: GoalResponse;
  goals: GoalResponse[];
  days: DayResponse[] | undefined;
  backHref: string;
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
            <Link
              key={child.id}
              href={goalDetailHref(child.id, backHref)}
              className="subgoal-card"
              data-goal-id={child.id}
            >
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
  const weekGoals = sortGoals(goals.filter((candidate) => candidate.type === "WEEK"));
  const openDayCount = (daysQuery.data ?? []).filter((day) => day.status !== "DONE" && day.status !== "SKIPPED").length;

  return (
    <>
      <section className="card">
        <div className="goal-header-row week-days-header">
          <div>
            <strong>이번 주 Days</strong>
            <div className="mini">
              {layout === "week"
                ? "Day를 클릭하면 날짜와 시간을 바로 수정할 수 있습니다."
                : "이 주간 목표에 연결된 Day를 날짜 순으로 봅니다."}
            </div>
          </div>
          <div className="card-actions week-days-actions" style={{ marginTop: 0 }}>
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
            weekGoals={weekGoals}
            onClose={() => setCreating(false)}
          />
        )}
      </section>
      {today !== null && daysQuery.isSuccess && (
        <PlanningCoachCard goal={goal} today={today} openDayCount={openDayCount} weekGoals={weekGoals} />
      )}
    </>
  );
}
