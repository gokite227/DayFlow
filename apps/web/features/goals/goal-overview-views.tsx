"use client";

import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/query-state";
import { addDays, weekDates } from "@/features/calendar/calendar-time";
import { goalPeriodLabel, periodRangeLabel } from "./goal-period";
import { GoalProgress } from "./goal-progress";
import { GOAL_TYPE_LABEL, childrenOf, sortGoals } from "./goal-tree";
import { WeekGoalDays, WeekLayoutSwitch } from "./goal-week-days";
import {
  goalContext,
  goalFlows,
  goalsViewHref,
  isCurrentGoal,
  weekGoalsInWeek,
  type GoalsViewState,
} from "./goal-views";

type Days = DayResponse[] | undefined;

/**
 * 전체: each YEAR as a flow of four fixed stages (prototype "전체 흐름", without recursive nesting).
 * The Goal containing today is highlighted like the prototype's current node.
 */
export function GoalFlowView({
  goals,
  days,
  today,
  rootId,
}: {
  goals: GoalResponse[];
  days: Days;
  today: string;
  rootId: string | null;
}) {
  const flows = goalFlows(goals, rootId);
  if (flows.length === 0) {
    return <EmptyState>연간 목표를 먼저 만들어주세요.</EmptyState>;
  }
  const stages = [
    { key: "quarters", label: "분기" },
    { key: "months", label: "월간" },
    { key: "weeks", label: "주간" },
  ] as const;

  return (
    <div className="stack">
      {rootId && (
        <div className="breadcrumb">
          <Link href={goalsViewHref({ view: "all" }, today)}>전체 흐름</Link>
          <span aria-hidden>›</span>
          <span aria-current="page">
            {goalPeriodLabel(flows[0]!.year)} {flows[0]!.year.title}
          </span>
        </div>
      )}
      {flows.map((flow) => (
        <section key={flow.year.id} className="card flow-root" data-flow-year={flow.year.id}>
          <div className="flow-top-actions">
            <div>
              <span className="period-badge">{goalPeriodLabel(flow.year)}</span>
              <h2 className="flow-year-title">{flow.year.title}</h2>
              {flow.year.why && <div className="mini">{flow.year.why}</div>}
            </div>
            <Link href={`/goals/${flow.year.id}`} className="btn ghost small">
              목표 상세
            </Link>
          </div>
          <GoalProgress goal={flow.year} goals={goals} days={days} />
          <div className="flow-stages">
            {stages.map((stage) => {
              const items = flow[stage.key];
              return (
                <div key={stage.key} className="flow-stage" data-stage={stage.key}>
                  <div className="flow-stage-label">
                    <span aria-hidden>↓</span> {stage.label}
                  </div>
                  {items.length === 0 ? (
                    <div className="mini flow-empty">아직 {stage.label} 목표가 없습니다.</div>
                  ) : (
                    <div className="flow-stage-items">
                      {items.map((item) => {
                        const parent = goals.find((goal) => goal.id === item.parentGoalId);
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
                              <span className="flow-goal-parent">› {goalPeriodLabel(parent)} {parent.title}</span>
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
      ))}
    </div>
  );
}

/** 연간: YEAR Goals as root cards with their quarter preview (prototype overview/year view). */
export function GoalYearView({ goals, days, today }: { goals: GoalResponse[]; days: Days; today: string }) {
  const router = useRouter();
  const years = sortGoals(goals.filter((goal) => goal.type === "YEAR"));
  if (years.length === 0) {
    return <EmptyState>아직 연간 목표가 없습니다. + 새 목표에서 연도를 고르고 첫 목표를 만들어보세요.</EmptyState>;
  }
  return (
    <div className="goal-root-grid">
      {years.map((goal) => {
        const quarters = childrenOf(goals, goal.id);
        return (
          <div
            key={goal.id}
            role="link"
            tabIndex={0}
            className="goal-root-card"
            data-goal-id={goal.id}
            onClick={() => router.push(`/goals/${goal.id}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter") router.push(`/goals/${goal.id}`);
            }}
          >
            <div className="goal-card-meta">
              <span className="period-badge">{goalPeriodLabel(goal)}</span>
              <span className="mini">우선순위 {goal.priority}</span>
            </div>
            <h4>{goal.title}</h4>
            {goal.why && <div className="goal-why-line">{goal.why}</div>}
            <GoalProgress goal={goal} goals={goals} days={days} />
            <div className="goal-child-preview">
              {quarters.length === 0 ? (
                <div className="mini">아직 하위 목표가 없습니다.</div>
              ) : (
                quarters.slice(0, 4).map((quarter) => (
                  <div key={quarter.id} className="preview-row">
                    <span>
                      <span className="preview-period">{goalPeriodLabel(quarter)}</span> {quarter.title}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="card-actions">
              <Link href={`/goals/${goal.id}`} className="btn small secondary" onClick={(event) => event.stopPropagation()}>
                목표 열기
              </Link>
              <Link
                href={goalsViewHref({ view: "all", rootId: goal.id }, today)}
                className="btn small ghost"
                onClick={(event) => event.stopPropagation()}
              >
                전체 흐름 보기
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 분기 / 월간: Goals of one type as period cards, grouped under the YEAR they belong to. */
export function GoalPeriodListView({
  type,
  goals,
  days,
  today,
}: {
  type: "QUARTER" | "MONTH";
  goals: GoalResponse[];
  days: Days;
  today: string;
}) {
  const ofType = goals.filter((goal) => goal.type === type).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (ofType.length === 0) {
    return <EmptyState>{GOAL_TYPE_LABEL[type]} 목표가 없습니다. 연간 목표 안에서 만들거나 + 새 목표를 사용하세요.</EmptyState>;
  }
  const yearOf = (goal: GoalResponse): GoalResponse | undefined => {
    let current: GoalResponse | undefined = goal;
    while (current && current.type !== "YEAR") {
      const parentId: string | null = current.parentGoalId;
      current = parentId ? goals.find((candidate) => candidate.id === parentId) : undefined;
    }
    return current;
  };
  const groups = new Map<string, { year: GoalResponse | undefined; items: GoalResponse[] }>();
  for (const goal of ofType) {
    const year = yearOf(goal);
    const key = year?.id ?? "none";
    groups.set(key, { year, items: [...(groups.get(key)?.items ?? []), goal] });
  }

  return (
    <div className="stack">
      {[...groups.values()].map(({ year, items }) => (
        <section key={year?.id ?? "none"} className="period-group">
          <div className="period-group-head">
            {year ? (
              <Link href={`/goals/${year.id}`}>
                <span className="period-badge">{goalPeriodLabel(year)}</span> {year.title}
              </Link>
            ) : (
              <span className="mini">연간 목표 없음</span>
            )}
          </div>
          <div className="period-list">
            {items.map((goal) => (
              <Link
                key={goal.id}
                href={`/goals/${goal.id}`}
                className={`period-goal-card${isCurrentGoal(goal, today) ? " current" : ""}`}
                data-goal-id={goal.id}
              >
                <div className="goal-card-meta">
                  <span className="period-badge">{goalPeriodLabel(goal, true)}</span>
                  <span className="mini">{periodRangeLabel(goal)}</span>
                </div>
                <h3 className="period-goal-title">{goal.title}</h3>
                <div className="goal-period">{goalContext(goals, goal)}</div>
                <GoalProgress goal={goal} goals={goals} days={days} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** 주간: 주간 뷰 (one Mon–Sun week of WEEK Goals and their Days) or 리스트 뷰 (all WEEK Goals by period). */
export function GoalWeekView({
  state,
  goals,
  days,
  today,
}: {
  state: GoalsViewState;
  goals: GoalResponse[];
  days: Days;
  today: string;
}) {
  const hrefFor = (next: Partial<GoalsViewState>) => goalsViewHref({ ...state, ...next, view: "week" }, today);
  const weekEnd = addDays(state.weekStart, 6);
  const inWeek = weekGoalsInWeek(goals, state.weekStart);
  const allWeeks = goals.filter((goal) => goal.type === "WEEK").sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="stack">
      <div className="goal-header-row">
        <div>
          <strong>주간 목표</strong>
          <div className="mini">
            {state.layout === "week" ? "한 주의 주간 목표와 Day를 요일별로 봅니다." : "주간 목표를 기간 순으로 봅니다."}
          </div>
        </div>
        <WeekLayoutSwitch layout={state.layout} hrefFor={(layout) => hrefFor({ layout })} />
      </div>

      {state.layout === "week" ? (
        <>
          <div className="period-toolbar">
            <Link href={hrefFor({ weekStart: addDays(state.weekStart, -7) })} replace scroll={false} className="btn ghost small" aria-label="이전 주">
              ←
            </Link>
            <div className="period-title">{periodRangeLabel({ startDate: state.weekStart, endDate: weekEnd })}</div>
            <Link href={hrefFor({ weekStart: addDays(state.weekStart, 7) })} replace scroll={false} className="btn ghost small" aria-label="다음 주">
              →
            </Link>
            <Link href={hrefFor({ weekStart: undefined })} replace scroll={false} className="btn secondary small">
              이번 주
            </Link>
          </div>
          {inWeek.length === 0 ? (
            <EmptyState>이 주에 등록된 주간 목표가 없습니다.</EmptyState>
          ) : (
            <>
              <div className="period-list">
                {inWeek.map((goal) => (
                  <Link key={goal.id} href={`/goals/${goal.id}`} className="period-goal-card" data-goal-id={goal.id}>
                    <div className="goal-card-meta">
                      <span className="period-badge">{goalPeriodLabel(goal, true)}</span>
                      <span className="mini">{periodRangeLabel(goal)}</span>
                    </div>
                    <h3 className="period-goal-title">{goal.title}</h3>
                    <div className="goal-period">{goalContext(goals, goal)}</div>
                    <GoalProgress goal={goal} goals={goals} days={days} />
                  </Link>
                ))}
              </div>
              <section className="card">
                <WeekGoalDays
                  layout="week"
                  dates={weekDates(state.weekStart)}
                  weekGoals={inWeek}
                  goals={goals}
                  days={days ?? []}
                  today={today}
                />
              </section>
            </>
          )}
        </>
      ) : allWeeks.length === 0 ? (
        <EmptyState>주간 목표가 없습니다. 월간 목표 안에서 + 주간으로 만들어보세요.</EmptyState>
      ) : (
        <div className="week-goal-list">
          {allWeeks.map((goal) => (
            <Link
              key={goal.id}
              href={`/goals/${goal.id}`}
              className={`week-goal-row${isCurrentGoal(goal, today) ? " current" : ""}`}
              data-goal-id={goal.id}
            >
              <span className="period-badge">{goalPeriodLabel(goal, true)}</span>
              <span className="week-goal-main">
                <strong>{goal.title}</strong>
                <span className="mini">
                  {periodRangeLabel(goal)} · {goalContext(goals, goal)}
                </span>
              </span>
              <span className="week-goal-progress">
                <GoalProgress goal={goal} goals={goals} days={days} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
