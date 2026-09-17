"use client";

import type { DayResponse, PeriodGoalResponse } from "@dayflow/api-client";
import { groupDaysByWeek } from "@dayflow/domain";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { DayFormModal, type DayFormTarget } from "@/features/days/day-form-modal";
import { DayItem } from "@/features/days/day-item";
import { useDays, useUpdateDay } from "@/features/days/day-queries";
import { doneToggleRequest } from "@/features/days/day-values";
import { sortDays } from "@/features/days/day-filters";
import { periodRangeLabel } from "./goal-period";
import { PlanningCoachCard } from "./planning-coach-card";
import { useDeletePeriodGoal } from "./period-goal-queries";
import { PeriodGoalFormModal } from "./period-goal-form-modal";
import {
  PERIOD_DELETE_BLOCKED_MESSAGE,
  defaultDayDate,
  periodGoalCalendarHref,
  periodGoalsHref,
} from "./period-goal-values";
import { PeriodGoalProgress, PeriodStatusBadge } from "./period-goal-views";

export type PeriodDayLayout = "all" | "week";

export function parsePeriodDayLayout(value: string | null): PeriodDayLayout {
  return value === "all" ? "all" : "week";
}

/**
 * A PERIOD Goal: its range, derived status, progress and linked Days. Days can be shown as one list or
 * grouped by week for long periods; the grouping is visual only (no WEEK Goals are created).
 */
export function PeriodGoalDetail({ goal, today, backHref }: { goal: PeriodGoalResponse; today: string; backHref: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const layout = parsePeriodDayLayout(searchParams.get("layout"));
  const daysQuery = useDays({ goalId: goal.id });
  const updateDay = useUpdateDay();
  const deleteGoal = useDeletePeriodGoal();
  const [editingGoal, setEditingGoal] = useState(false);
  const [dayTarget, setDayTarget] = useState<DayFormTarget | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const linkedDays = daysQuery.data ?? [];
  const listHref = backHref ?? periodGoalsHref();

  const remove = () => {
    setDeleteBlocked(false);
    // The server refuses to delete a Goal that still has Days (GOAL_IN_USE); say so before asking.
    if (linkedDays.length > 0) {
      setDeleteBlocked(true);
      return;
    }
    if (!window.confirm(`"${goal.title}" 기간 목표를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    deleteGoal.mutate(goal.id, { onSuccess: () => router.replace(listHref) });
  };

  const layoutHref = (next: PeriodDayLayout) => `/goals/${goal.id}?layout=${next}`;

  return (
    <>
      <div className="detail-back">
        <Link href={listHref} className="btn ghost small">
          ← 목표 목록으로
        </Link>
      </div>

      <div className="stack">
        <section className="card detail-hero">
          <div className="detail-meta">
            <span className="goal-type">기간 목표</span>
            <PeriodStatusBadge goal={goal} today={today} />
            <span className="pill">
              {goal.startDate} ~ {goal.endDate}
            </span>
          </div>
          <div className="detail-title">{goal.title}</div>
          {goal.why && <div className="goal-why">Why · {goal.why}</div>}
          <div className="detail-progress">
            <PeriodGoalProgress goal={goal} days={daysQuery.data} />
          </div>
          {deleteBlocked && (
            <div className="notice error" style={{ marginTop: 12 }} role="alert">
              {PERIOD_DELETE_BLOCKED_MESSAGE}
            </div>
          )}
          {deleteGoal.error && (
            <div style={{ marginTop: 12 }}>
              <ErrorNotice error={deleteGoal.error} />
            </div>
          )}
          <div className="card-actions">
            <Link href={periodGoalCalendarHref(goal)} className="btn ghost small" data-calendar-href={periodGoalCalendarHref(goal)}>
              캘린더에서 보기
            </Link>
            <button type="button" className="btn ghost small" onClick={() => setEditingGoal(true)}>
              수정
            </button>
            <button
              type="button"
              className="btn danger small"
              onClick={remove}
              disabled={deleteGoal.isPending || daysQuery.isPending}
            >
              {deleteGoal.isPending ? "삭제 중…" : "삭제"}
            </button>
          </div>
        </section>

        <section className="card">
          <div className="goal-header-row">
            <div>
              <strong>연결된 Day</strong>
              <div className="mini">{periodRangeLabel(goal)} 동안 이 목표로 실행할 Day예요.</div>
            </div>
            <div className="card-actions" style={{ marginTop: 0 }}>
              <div className="day-view-switch" role="tablist" aria-label="Day 보기">
                {(["all", "week"] as const).map((value) => (
                  <Link
                    key={value}
                    href={layoutHref(value)}
                    replace
                    scroll={false}
                    role="tab"
                    aria-selected={layout === value}
                    className={layout === value ? "active" : undefined}
                  >
                    {value === "all" ? "전체" : "주차별"}
                  </Link>
                ))}
              </div>
              <button
                type="button"
                className="btn small"
                onClick={() => setDayTarget({ mode: "create", goalId: goal.id, plannedDate: defaultDayDate(goal, today) })}
              >
                + Day
              </button>
            </div>
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
          ) : linkedDays.length === 0 ? (
            <EmptyState>아직 연결된 Day가 없어요.</EmptyState>
          ) : (
            <PeriodDayGroups
              days={linkedDays}
              goal={goal}
              layout={layout}
              renderDay={(day) => (
                <DayItem
                  key={day.id}
                  day={day}
                  goal={undefined}
                  toggling={updateDay.isPending && updateDay.variables?.dayId === day.id}
                  onToggle={() => updateDay.mutate({ dayId: day.id, body: doneToggleRequest(day) })}
                  onOpen={() => {
                    updateDay.reset();
                    setDayTarget({ mode: "edit", day });
                  }}
                />
              )}
            />
          )}
        </section>

        {daysQuery.isSuccess && (
          <PlanningCoachCard
            goal={goal}
            today={today}
            openDayCount={linkedDays.filter((day) => day.status !== "DONE" && day.status !== "SKIPPED").length}
          />
        )}
      </div>

      {editingGoal && (
        <PeriodGoalFormModal
          target={{ mode: "edit", goal }}
          today={today}
          linkedDays={linkedDays}
          onClose={() => setEditingGoal(false)}
        />
      )}
      {dayTarget && <DayFormModal target={dayTarget} onClose={() => setDayTarget(null)} />}
    </>
  );
}

/**
 * The Days as groups. Each group is a heading plus Days, so another grouping (e.g. optional sections of
 * a PERIOD Goal) can reuse this rendering later.
 */
function PeriodDayGroups({
  days,
  goal,
  layout,
  renderDay,
}: {
  days: readonly DayResponse[];
  goal: PeriodGoalResponse;
  layout: PeriodDayLayout;
  renderDay: (day: DayResponse) => ReactNode;
}) {
  const groups =
    layout === "all"
      ? [{ key: "all", title: null, days: sortDays(days) }]
      : groupDaysByWeek(sortDays(days), goal).map((group) => ({
          key: group.key,
          title: group.range ? periodRangeLabel(group.range) : "날짜 없음",
          days: group.days,
        }));
  return (
    <div>
      {groups.map((group) => (
        <div key={group.key} className="period-day-group" data-group={group.key}>
          {group.title && <div className="period-day-group-head">{group.title}</div>}
          <div className="day-list">{group.days.map(renderDay)}</div>
        </div>
      ))}
    </div>
  );
}
