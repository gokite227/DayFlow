"use client";

import type { DayPriority, DayResponse, GoalResponse } from "@dayflow/api-client";
import { sortPeriodGoals } from "@dayflow/domain";
import { usePeriodGoals } from "@/features/goals/period-goal-queries";
import { dayGoalLink, periodGoalOptionLabel } from "@/features/goals/period-goal-values";
import { useState, type FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { formatPeriod, sortGoals } from "@/features/goals/goal-tree";
import { useGoals } from "@/features/goals/goal-queries";
import { useToday } from "@/lib/use-today";
import { DayFormModal, type DayFormTarget } from "./day-form-modal";
import { DayItem } from "./day-item";
import { useCreateDay, useDays, useUpdateDay } from "./day-queries";
import { useDayTags } from "./day-tag-queries";
import { DayTagManager } from "./day-tag-manager";
import { sortTags } from "./day-tag-values";
import {
  DAYS_VIEWS,
  DAYS_VIEW_LABEL,
  countByView,
  emptyDaysFilters,
  filterDays,
  hasActiveFilters,
  sortDays,
  type DaysFilters,
  type DaysView,
} from "./day-filters";
import { DAY_PRIORITIES, DAY_PRIORITY_LABEL, DAY_STATUS_LABEL, doneToggleRequest, quickAddDayRequest } from "./day-values";

/**
 * DAY-006: Days is the Inbox / Backlog of every Task. Today runs the day and Calendar places it;
 * this screen only collects, searches and organizes. The whole list is loaded once and filtered
 * client-side, so switching views and tags needs no extra request.
 */
export function DaysView() {
  const today = useToday();
  return (
    <>
      <PageHeader
        title="Days"
        subtitle="해야 하는 모든 일을 모아두는 Inbox입니다. 목표가 없어도 괜찮아요."
      />
      {today === null ? <LoadingState /> : <DaysContent today={today} />}
    </>
  );
}

function DaysContent({ today }: { today: string }) {
  const [filters, setFilters] = useState<DaysFilters>(() => emptyDaysFilters("all"));
  const [formTarget, setFormTarget] = useState<DayFormTarget | null>(null);
  const [managingTags, setManagingTags] = useState(false);

  const daysQuery = useDays();
  const weekGoalsQuery = useGoals({ type: "WEEK" });
  const tagsQuery = useDayTags();
  const updateDay = useUpdateDay();

  const periodGoalsQuery = usePeriodGoals();
  const weekGoals = sortGoals(weekGoalsQuery.data ?? []);
  const periodGoals = sortPeriodGoals(periodGoalsQuery.data ?? [], today);
  const goalsById = new Map<string, GoalResponse>([...weekGoals, ...periodGoals].map((goal) => [goal.id, goal]));
  const tags = sortTags(tagsQuery.data ?? []);
  const allDays = daysQuery.data ?? [];
  const counts = countByView(allDays, today);
  const days = sortDays(filterDays(allDays, filters, today));

  const set = <Key extends keyof DaysFilters>(key: Key, value: DaysFilters[Key]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const toggleTag = (tagId: string) =>
    set("tagIds", filters.tagIds.includes(tagId)
      ? filters.tagIds.filter((id) => id !== tagId)
      : [...filters.tagIds, tagId]);

  const goalValue =
    filters.goal === "all" || filters.goal === "with" || filters.goal === "without"
      ? filters.goal
      : filters.goal.goalId;

  return (
    <>
      <div className="card">
        <QuickAddDay onOpenDetail={() => setFormTarget({ mode: "create", goalId: "" })} />

        <div className="day-view-switch" role="tablist" aria-label="Day 보기" style={{ marginBottom: 12 }}>
          {DAYS_VIEWS.map((view: DaysView) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={filters.view === view}
              className={filters.view === view ? "active" : undefined}
              onClick={() => set("view", view)}
            >
              {DAYS_VIEW_LABEL[view]}
              <span className="tab-count">{counts[view]}</span>
            </button>
          ))}
        </div>

        <div className="toolbar">
          <label className="mini" htmlFor="days-goal-filter">
            목표
          </label>
          <select
            id="days-goal-filter"
            value={goalValue}
            onChange={(event) => {
              const value = event.target.value;
              set("goal", value === "all" || value === "with" || value === "without" ? value : { goalId: value });
            }}
          >
            <option value="all">전체</option>
            <option value="with">목표 있음</option>
            <option value="without">목표 없음</option>
            {weekGoals.length > 0 && (
              <optgroup label="계획 목표 (주간)">
                {weekGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title} ({formatPeriod(goal)})
                  </option>
                ))}
              </optgroup>
            )}
            {periodGoals.length > 0 && (
              <optgroup label="기간 목표">
                {periodGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {periodGoalOptionLabel(goal, today)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <label className="mini" htmlFor="days-priority-filter">
            우선순위
          </label>
          <select
            id="days-priority-filter"
            value={filters.priority}
            onChange={(event) => set("priority", event.target.value as DayPriority | "all")}
          >
            <option value="all">전체</option>
            {DAY_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {DAY_PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>

          <label className="mini" htmlFor="days-status-filter">
            상태
          </label>
          <select
            id="days-status-filter"
            value={filters.status}
            onChange={(event) => set("status", event.target.value as DayResponse["status"] | "all")}
          >
            <option value="all">전체</option>
            {(Object.keys(DAY_STATUS_LABEL) as DayResponse["status"][]).map((status) => (
              <option key={status} value={status}>
                {DAY_STATUS_LABEL[status]}
              </option>
            ))}
          </select>

          <input
            type="search"
            placeholder="제목 검색"
            aria-label="Day 제목 검색"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
          />

          {hasActiveFilters(filters) && (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setFilters({ ...emptyDaysFilters(filters.view) })}
            >
              필터 초기화
            </button>
          )}
          {updateDay.isPending && <span className="mini">저장 중…</span>}
        </div>

        <div className="toolbar">
          <span className="mini">태그</span>
          {tags.length === 0 ? (
            <span className="mini">아직 태그가 없습니다.</span>
          ) : (
            tags.map((tag) => {
              const active = filters.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={`tag-filter${active ? " active" : ""}`}
                  style={active ? { borderColor: tag.color, color: tag.color } : undefined}
                  aria-pressed={active}
                  onClick={() => toggleTag(tag.id)}
                >
                  <span className="tag-dot" style={{ background: tag.color }} />
                  {tag.name}
                </button>
              );
            })
          )}
          <button type="button" className="btn ghost small" onClick={() => setManagingTags(true)}>
            태그 관리
          </button>
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
        ) : days.length === 0 ? (
          <EmptyState>
            {allDays.length === 0
              ? "아직 Day가 없습니다. 위에 제목만 적어 바로 담아보세요."
              : "이 조건에 맞는 Day가 없습니다."}
          </EmptyState>
        ) : (
          <div className="day-list">
            {days.map((day) => (
              <DayItem
                key={day.id}
                day={day}
                goal={dayGoalLink(day, goalsById)}
                toggling={updateDay.isPending && updateDay.variables?.dayId === day.id}
                onToggle={() => updateDay.mutate({ dayId: day.id, body: doneToggleRequest(day) })}
                onOpen={() => {
                  updateDay.reset();
                  setFormTarget({ mode: "edit", day });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {formTarget && (
        <DayFormModal target={formTarget} weekGoals={weekGoals} onClose={() => setFormTarget(null)} />
      )}
      {managingTags && <DayTagManager onClose={() => setManagingTags(false)} />}
    </>
  );
}

/**
 * DAY-006 Backlog quick add: a title is enough. The Day lands in 미배치 with no Goal, no date and
 * no Tags; everything else is decided later in the form or on the Calendar.
 */
function QuickAddDay({ onOpenDetail }: { onOpenDetail: () => void }) {
  const [title, setTitle] = useState("");
  const createDay = useCreateDay();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim() === "") return;
    createDay.mutate(quickAddDayRequest(title.trim()), { onSuccess: () => setTitle("") });
  };

  return (
    <form onSubmit={submit}>
      <div className="add-day-line top">
        <input
          type="text"
          required
          maxLength={200}
          placeholder="할 일을 적어두세요 (예: 세탁하기)"
          aria-label="새 Day 제목"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" className="btn" disabled={createDay.isPending}>
          {createDay.isPending ? "담는 중…" : "담기"}
        </button>
        <button type="button" className="btn secondary" onClick={onOpenDetail}>
          상세 추가
        </button>
      </div>
      {createDay.error && (
        <div style={{ marginTop: 10 }}>
          <ErrorNotice error={createDay.error} />
        </div>
      )}
    </form>
  );
}
