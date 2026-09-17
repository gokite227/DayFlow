"use client";

import type {
  DayResponse,
  CalendarGoalResponse as GoalResponse,
  GoalResponse as AnyGoalResponse,
  PeriodGoalResponse,
  ReviewItemResponse,
  ReviewResponse,
} from "@dayflow/api-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { koreanShortDate } from "@/features/calendar/calendar-time";
import { useDays } from "@/features/days/day-queries";
import { DAY_STATUS_LABEL, describeDaySchedule } from "@/features/days/day-values";
import { useGoals } from "@/features/goals/goal-queries";
import { periodRangeLabel } from "@/features/goals/goal-period";
import { GOAL_TYPE_LABEL, goalPath, sortGoals } from "@/features/goals/goal-tree";
import { usePeriodGoals } from "@/features/goals/period-goal-queries";
import { periodCountLabel, periodProgressLabel, summarizePeriodGoal } from "@/features/goals/period-goal-values";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData } from "@/lib/api-error";
import { useToday } from "@/lib/use-today";
import {
  REVIEW_GOAL_TYPE,
  REVIEW_TYPES,
  REVIEW_TYPE_LABEL,
  reviewPeriod,
  shiftAnchor,
  type ReviewPeriod,
  type ReviewType,
} from "./review-period";
import {
  goalChipLabel,
  nextGoalCandidates,
  reviewGoalCandidates,
  reviewPeriodGoalCandidates,
  toItemRequest,
} from "./review-goals";
import { parseReviewViewState, reviewArchiveHref, reviewWriteHref } from "./review-archive";
import { ReviewArchiveView } from "./review-archive-view";
import { useReview, useSaveReview } from "./review-queries";
import { formatRate, summarizeDays, summarizeGoal } from "./review-summary";
import { useRecoveryCandidates } from "@/features/recovery/recovery-queries";
import { TryToDayModal } from "./try-to-day-modal";
import { createReviewCoachFlow, keptOnReplace } from "./review-coach-flow";
import { ReviewCoachCard, ReviewDraftBar, ReviewDraftLines } from "./review-coach-card";

type ItemKind = ReviewItemResponse["kind"];

const KPT: { kind: ItemKind; title: string; hint: string; placeholder: string }[] = [
  { kind: "KEEP", title: "Keep", hint: "계속 유지하고 싶은 것", placeholder: "예: 오전에 개발하니 집중이 잘 됐다" },
  { kind: "PROBLEM", title: "Problem", hint: "막힌 점 · 아쉬웠던 점", placeholder: "예: 저녁 일정이 너무 많았다" },
  { kind: "TRY", title: "Try", hint: "다음 기간에 바꿔볼 것", placeholder: "예: 개발 시작 전에 30분 설계하기" },
];

export function ReviewView() {
  const today = useToday();
  return today === null ? <LoadingState /> : <ReviewContent today={today} />;
}

/**
 * Review has two areas, 회고 작성 and 회고 모아보기. Both keep their state in the URL (see review-archive.ts), so a
 * review opened from the archive can be reloaded or shared, and browser back returns to the same archive list.
 */
function ReviewContent({ today }: { today: string }) {
  const router = useRouter();
  const state = parseReviewViewState(useSearchParams(), today);
  const period = reviewPeriod(state.type, state.date);
  // Moving between periods replaces the URL: back leaves the editor instead of walking through periods.
  const goToPeriod = (type: ReviewType, date: string) => router.replace(reviewWriteHref(type, date), { scroll: false });

  return (
    <>
      <PageHeader title="Review" subtitle="그 기간의 Goal과 기록을 먼저 보고 KPT 회고를 작성하고, 지난 회고를 모아봅니다." />

      <div className="goal-tabs-row">
        <nav className="goal-tabs" role="tablist" aria-label="회고 화면">
          <Link
            href={reviewWriteHref(state.type, state.date)}
            role="tab"
            aria-selected={state.mode === "write"}
            className={state.mode === "write" ? "active" : undefined}
          >
            회고 작성
          </Link>
          <Link
            href={reviewArchiveHref({ type: "ALL", q: "" })}
            role="tab"
            aria-selected={state.mode === "archive"}
            className={state.mode === "archive" ? "active" : undefined}
          >
            회고 모아보기
          </Link>
        </nav>
      </div>

      {state.mode === "archive" ? (
        <ReviewArchiveView key={state.q} type={state.archiveType} q={state.q} />
      ) : (
        <>
          <div className="goal-tabs" role="tablist" aria-label="회고 기간">
            {REVIEW_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={state.type === value}
                className={state.type === value ? "active" : undefined}
                onClick={() => goToPeriod(value, state.date)}
              >
                {REVIEW_TYPE_LABEL[value]}
              </button>
            ))}
          </div>

          <div className="review-period-nav">
            <button
              type="button"
              className="btn ghost small"
              aria-label="이전 기간"
              onClick={() => goToPeriod(state.type, shiftAnchor(state.type, state.date, -1))}
            >
              ←
            </button>
            <div className="review-period-title">
              {REVIEW_TYPE_LABEL[state.type]} 회고 · {period.label}
            </div>
            <button
              type="button"
              className="btn ghost small"
              aria-label="다음 기간"
              onClick={() => goToPeriod(state.type, shiftAnchor(state.type, state.date, 1))}
            >
              →
            </button>
          </div>

          {/* Remount per period so drafts and pending state never leak between periods. */}
          <ReviewPeriodContent key={`${period.type}:${period.start}`} period={period} today={today} />
        </>
      )}
    </>
  );
}

function ReviewPeriodContent({ period, today }: { period: ReviewPeriod; today: string }) {
  const goalsQuery = useGoals();
  const periodGoalsQuery = usePeriodGoals();
  const daysQuery = useDays({ from: period.start, to: period.end });
  const reviewQuery = useReview(period.type, period.start);
  const [convertingItem, setConvertingItem] = useState<ReviewItemResponse | null>(null);

  const goals = goalsQuery.data ?? [];
  const days = daysQuery.data ?? [];
  const periodGoals = reviewGoalCandidates(goals, period);
  // PERIOD Goals overlapping the reviewed period, next to the CALENDAR Goals of the review level.
  const overlappingPeriodGoals = reviewPeriodGoalCandidates(periodGoalsQuery.data ?? [], period);
  const summary = summarizeDays(days);
  // Same rule as the Today banner (REC-001/REC-005): missed and not yet handled in this planning state.
  const candidatesQuery = useRecoveryCandidates(today);
  const missedCount = (candidatesQuery.data ?? []).filter(
    ({ day }) => day.plannedDate !== null && period.start <= day.plannedDate && day.plannedDate <= period.end,
  ).length;
  const weekGoals = sortGoals(goals.filter((goal) => goal.type === "WEEK"));
  // Converted Days can be planned outside this period, so they are looked up in the full list.
  const allDaysQuery = useDays();
  const daysById = new Map((allDaysQuery.data ?? []).map((day) => [day.id, day]));
  const goalLinks: GoalLinks = {
    goalsById: new Map<string, AnyGoalResponse>([...goals, ...(periodGoalsQuery.data ?? [])].map((goal) => [goal.id, goal])),
    sourceCandidates: [...periodGoals, ...overlappingPeriodGoals],
    nextCandidates: nextGoalCandidates(goals, period),
    daysById,
  };

  return (
    <div className="review-layout">
      <div className="review-side">
        <section className="card">
          <strong>기간 요약</strong>
          <div className="mini" style={{ marginBottom: 10 }}>
            날짜가 정해진 Day 기준입니다. 날짜 없는 Day는 포함하지 않아요.
          </div>
          {daysQuery.isPending ? (
            <LoadingState />
          ) : daysQuery.isError ? (
            <ErrorNotice error={daysQuery.error} onRetry={() => void daysQuery.refetch()} />
          ) : (
            <div className="review-summary-grid">
              <Metric value={formatRate(summary.completionRate)} label="완료율 (내려놓은 Day 제외)" />
              <Metric value={`${summary.done}`} label="완료 Day" />
              <Metric value={`${summary.open}`} label="미완료 Day" />
              <Metric value={`${summary.coreDone}/${summary.coreTotal}`} label="핵심 Day 완료" />
              {summary.skipped > 0 && <Metric value={`${summary.skipped}`} label="내려놓은 Day" />}
            </div>
          )}
          {missedCount > 0 && (
            <Link href="/recovery" className="recovery-link">
              지난 계획 {missedCount}개를 다시 정리할 수 있어요 · 다시 정리하기 →
            </Link>
          )}
        </section>

        <section className="card">
          <strong>Goals</strong>
          <div className="mini" style={{ marginBottom: 10 }}>
            해당 기간의 {GOAL_TYPE_LABEL[REVIEW_GOAL_TYPE[period.type]]} 목표와 상위 흐름
          </div>
          {goalsQuery.isPending ? (
            <LoadingState />
          ) : goalsQuery.isError ? (
            <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
          ) : periodGoals.length === 0 ? (
            <EmptyState>이 기간의 {GOAL_TYPE_LABEL[REVIEW_GOAL_TYPE[period.type]]} 목표가 없습니다.</EmptyState>
          ) : (
            <div className="review-goal-list">
              {periodGoals.map((goal) => (
                <ReviewGoalCard key={goal.id} goal={goal} goals={goals} days={days} />
              ))}
            </div>
          )}
          {overlappingPeriodGoals.length > 0 && (
            <>
              <div className="mini" style={{ margin: "14px 0 8px" }}>
                이 기간과 겹치는 기간 목표
              </div>
              <div className="review-goal-list">
                {overlappingPeriodGoals.map((goal) => (
                  <ReviewPeriodGoalCard key={goal.id} goal={goal} days={days} />
                ))}
              </div>
            </>
          )}
        </section>

        {period.type === "DAY" && (
          <section className="card">
            <strong>Days</strong>
            <div className="mini" style={{ marginBottom: 10 }}>
              일간 회고에서는 그날의 Day를 함께 확인합니다.
            </div>
            {days.length === 0 ? (
              <EmptyState>이 날짜에 계획된 Day가 없습니다.</EmptyState>
            ) : (
              <div className="review-days">
                {days.map((day) => (
                  <ReviewDayRow key={day.id} day={day} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <div>
        {reviewQuery.isPending ? (
          <LoadingState label="회고를 불러오는 중…" />
        ) : reviewQuery.isError ? (
          <ErrorNotice error={reviewQuery.error} onRetry={() => void reviewQuery.refetch()} />
        ) : (
          <KptEditor period={period} review={reviewQuery.data} links={goalLinks} onConvert={setConvertingItem} />
        )}
      </div>

      {convertingItem && (
        <TryToDayModal
          item={convertingItem}
          weekGoals={weekGoals}
          reviewType={period.type}
          periodStart={period.start}
          onClose={() => setConvertingItem(null)}
        />
      )}
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ReviewGoalCard({ goal, goals, days }: { goal: GoalResponse; goals: GoalResponse[]; days: DayResponse[] }) {
  const summary = summarizeGoal(goals, days, goal.id);
  const counted = summary.total - summary.skipped;
  return (
    <div className="review-goal-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 9, alignItems: "center" }}>
        <div>
          <span className="goal-type">{GOAL_TYPE_LABEL[goal.type]}</span> <strong style={{ marginLeft: 5 }}>{goal.title}</strong>
        </div>
        <strong>{formatRate(summary.completionRate)}</strong>
      </div>
      <div className="review-goal-path">
        {goalPath(goals, goal)
          .map((ancestor) => ancestor.title)
          .join(" › ")}
      </div>
      <div className="mini" style={{ marginTop: 4 }}>
        기간 내 Day 완료 {summary.done}/{counted}
        {summary.open > 0 ? ` · 미완료 ${summary.open}` : ""}
        {summary.skipped > 0 ? ` · 내려놓음 ${summary.skipped}` : ""}
      </div>
      <div className="progress" style={{ marginTop: 8 }}>
        <span style={{ width: `${Math.round((summary.completionRate ?? 0) * 100)}%` }} />
      </div>
    </div>
  );
}

/** A PERIOD Goal in the review context: Days of the reviewed period linked to it. */
function ReviewPeriodGoalCard({ goal, days }: { goal: PeriodGoalResponse; days: DayResponse[] }) {
  const summary = summarizePeriodGoal(days, goal.id);
  return (
    <Link href={`/goals/${goal.id}`} className="review-goal-card" style={{ display: "block", color: "inherit", textDecoration: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 9, alignItems: "center" }}>
        <div>
          <span className="goal-type">기간</span> <strong style={{ marginLeft: 5 }}>{goal.title}</strong>
        </div>
        <strong>{periodProgressLabel(summary)}</strong>
      </div>
      <div className="review-goal-path">{periodRangeLabel(goal)}</div>
      <div className="mini" style={{ marginTop: 4 }}>
        기간 내 Day {periodCountLabel(summary)}
      </div>
    </Link>
  );
}

function ReviewDayRow({ day }: { day: DayResponse }) {
  return (
    <div className={`review-day-row${day.status === "DONE" ? " done" : ""}`}>
      <div>
        <strong>{day.title}</strong>
        {day.coreDay && <span className="core-badge">핵심</span>}
        <div className="review-day-time">{describeDaySchedule(day)}</div>
      </div>
      <span className="mini">{DAY_STATUS_LABEL[day.status]}</span>
    </div>
  );
}

/** Lookups the KPT editor needs to show and change Goal links and Try results. */
interface GoalLinks {
  goalsById: Map<string, AnyGoalResponse>;
  /** REV-003: Goals a line can reflect on (CALENDAR of the review's level and PERIOD, overlapping the period). */
  sourceCandidates: AnyGoalResponse[];
  /** REV-004: later Goals a Try can be carried into. */
  nextCandidates: GoalResponse[];
  daysById: Map<string, DayResponse>;
}

type ItemRequest = ReturnType<typeof toItemRequest>;

/** KPT, rating and completion. Every change saves the whole review with expectedVersion. */
function KptEditor({
  period,
  review,
  links,
  onConvert,
}: {
  period: ReviewPeriod;
  review: ReviewResponse | null;
  links: GoalLinks;
  onConvert: (item: ReviewItemResponse) => void;
}) {
  const [drafts, setDrafts] = useState<Record<ItemKind, string>>({ KEEP: "", PROBLEM: "", TRY: "" });
  const [draftGoals, setDraftGoals] = useState<Record<ItemKind, string>>({ KEEP: "", PROBLEM: "", TRY: "" });
  // Which line has its Goal picker ("goal") or next-Goal picker ("next") open.
  const [editing, setEditing] = useState<{ itemId: string; mode: "goal" | "next" } | null>(null);
  const save = useSaveReview(period.type, period.start);
  // AI 회고 초안 (writing view only): drafts live here until the user saves them.
  const [coach] = useState(() =>
    createReviewCoachFlow({
      requestDraft: (body) => expectData(getDayFlowApiClient().POST("/api/v1/ai/coach/review", { body })),
    }),
  );
  const coachState = useSyncExternalStore(coach.subscribe, coach.getState, coach.getState);
  const typing = Object.values(drafts).some((value) => value.trim() !== "");
  const items = review?.items ?? [];
  const completed = review?.completed ?? false;
  const rating = review?.rating ?? null;

  const persist = (
    next: { items?: ItemRequest[]; rating?: number | null; completed?: boolean },
    onSaved?: () => void,
  ) =>
    save.mutate(
      {
        rating: next.rating !== undefined ? next.rating : rating,
        completed: next.completed ?? completed,
        items: next.items ?? items.map(toItemRequest),
        expectedVersion: review?.version ?? null,
      },
      { onSuccess: onSaved },
    );

  const addItem = (kind: ItemKind) => {
    const content = drafts[kind].trim();
    if (!content) return;
    const goalId = draftGoals[kind] === "" ? null : draftGoals[kind];
    persist({ items: [...items.map(toItemRequest), { id: null, kind, content, goalId, targetGoalId: null }] }, () => {
      setDrafts((current) => ({ ...current, [kind]: "" }));
      setDraftGoals((current) => ({ ...current, [kind]: "" }));
    });
  };

  const removeItem = (itemId: string) =>
    persist({ items: items.filter((item) => item.id !== itemId).map(toItemRequest) });

  /** Changes one link of one line; the Try → Day result (convertedDayId) is never touched here. */
  const updateLink = (itemId: string, change: { goalId?: string | null; targetGoalId?: string | null }) =>
    persist(
      { items: items.map((item) => (item.id === itemId ? { ...toItemRequest(item), ...change } : toItemRequest(item))) },
      () => setEditing(null),
    );

  const goalLabel = (goalId: string | null) => {
    const goal = goalId === null ? undefined : links.goalsById.get(goalId);
    return goal ? goalChipLabel(goal) : null;
  };

  return (
    <>
      {save.error ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorNotice error={save.error} />
        </div>
      ) : null}
      <ReviewCoachCard flow={coach} state={coachState} period={period} review={review} typing={typing} />

      <div className="review-kpt">
        {KPT.map(({ kind, title, hint, placeholder }) => {
          const kindItems = items.filter((item) => item.kind === kind);
          return (
            <section key={kind} className="kpt-card">
              <div className={`kpt-head ${kind.toLowerCase()}`}>
                <strong>{title}</strong>
                <span className="mini">{hint}</span>
              </div>
              <div className="kpt-items">
                {kindItems.length === 0 && !coachState.drafts.some((line) => line.kind === kind) ? (
                  <div className="mini">아직 작성한 내용이 없습니다.</div>
                ) : (
                  kindItems.map((item) => {
                    const sourceLabel = goalLabel(item.goalId);
                    const targetLabel = goalLabel(item.targetGoalId);
                    const convertedDay = item.convertedDayId ? links.daysById.get(item.convertedDayId) : undefined;
                    const pickingGoal = editing?.itemId === item.id && editing.mode === "goal";
                    const pickingNext = editing?.itemId === item.id && editing.mode === "next";
                    return (
                      <div
                        key={item.id}
                        className={`kpt-item${coachState.replacingIds.includes(item.id) && !keptOnReplace(item) ? " replacing" : ""}`}
                        data-item-id={item.id}
                      >
                        <div className="kpt-item-main">
                          <div>
                            <div className="kpt-item-content">{item.content}</div>
                            {sourceLabel && item.goalId && (
                              <Link href={`/goals/${item.goalId}`} className="kpt-goal-chip" title="이 회고가 가리키는 목표 열기">
                                {sourceLabel}
                              </Link>
                            )}
                          </div>
                          <div className="kpt-item-buttons">
                            <button
                              type="button"
                              className="btn ghost small"
                              aria-expanded={pickingGoal}
                              onClick={() => setEditing(pickingGoal ? null : { itemId: item.id, mode: "goal" })}
                              disabled={save.isPending}
                            >
                              {item.goalId ? "목표 변경" : "목표 연결"}
                            </button>
                            <button type="button" className="btn secondary small" onClick={() => removeItem(item.id)} disabled={save.isPending}>
                              삭제
                            </button>
                          </div>
                        </div>

                        {pickingGoal && (
                          <GoalPicker
                            label="연결할 목표"
                            candidates={links.sourceCandidates}
                            current={item.goalId === null ? undefined : links.goalsById.get(item.goalId)}
                            emptyText="이 기간에 연결할 목표가 없어요."
                            clearLabel="목표 연결 해제"
                            disabled={save.isPending}
                            onPick={(goalId) => updateLink(item.id, { goalId })}
                            onCancel={() => setEditing(null)}
                          />
                        )}

                        {kind === "TRY" && (
                          <div className="kpt-try-results">
                            {item.convertedDayId ? (
                              <div className="kpt-try-result">
                                <span className="converted-badge">✓ Day로 추가됨</span>
                                {convertedDay && (
                                  <span className="mini">
                                    → {convertedDay.plannedDate ? `${koreanShortDate(convertedDay.plannedDate)} · ` : "날짜 미정 · "}
                                    {convertedDay.title} · {DAY_STATUS_LABEL[convertedDay.status]}
                                  </span>
                                )}
                              </div>
                            ) : null}
                            {targetLabel ? (
                              <div className="kpt-try-result">
                                <span className="converted-badge">✓ 다음 목표에 연결됨</span>
                                {item.targetGoalId ? (
                                  <Link href={`/goals/${item.targetGoalId}`} className="mini">
                                    → {targetLabel}
                                  </Link>
                                ) : null}
                                <button
                                  type="button"
                                  className="btn ghost small"
                                  onClick={() => updateLink(item.id, { targetGoalId: null })}
                                  disabled={save.isPending}
                                >
                                  연결 해제
                                </button>
                              </div>
                            ) : null}
                            <div className="kpt-item-actions">
                              {!item.convertedDayId && (
                                <button type="button" className="btn ghost small" onClick={() => onConvert(item)} disabled={save.isPending}>
                                  Day로 만들기
                                </button>
                              )}
                              {!item.targetGoalId && (
                                <button
                                  type="button"
                                  className="btn ghost small"
                                  aria-expanded={pickingNext}
                                  onClick={() => setEditing(pickingNext ? null : { itemId: item.id, mode: "next" })}
                                  disabled={save.isPending}
                                >
                                  다음 목표에 연결
                                </button>
                              )}
                            </div>
                            {pickingNext && (
                              <GoalPicker
                                label="이어갈 다음 목표"
                                candidates={links.nextCandidates}
                                emptyText="연결할 다음 목표가 아직 없어요."
                                disabled={save.isPending}
                                onPick={(targetGoalId) => updateLink(item.id, { targetGoalId })}
                                onCancel={() => setEditing(null)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <ReviewDraftLines flow={coach} state={coachState} kind={kind} title={title} />
              </div>
              <form
                className="kpt-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  addItem(kind);
                }}
              >
                <input
                  aria-label={`${title} 추가`}
                  placeholder={placeholder}
                  maxLength={1000}
                  value={drafts[kind]}
                  onChange={(event) => setDrafts((current) => ({ ...current, [kind]: event.target.value }))}
                  disabled={save.isPending}
                />
                <select
                  aria-label={`${title} 목표`}
                  value={draftGoals[kind]}
                  onChange={(event) => setDraftGoals((current) => ({ ...current, [kind]: event.target.value }))}
                  disabled={save.isPending}
                >
                  <option value="">목표 연결 안 함</option>
                  {(["CALENDAR", "PERIOD"] as const).map((goalKind) => {
                    const ofKind = links.sourceCandidates.filter((goal) => goal.kind === goalKind);
                    return ofKind.length === 0 ? null : (
                      <optgroup key={goalKind} label={goalKind === "CALENDAR" ? "계획 목표" : "기간 목표"}>
                        {ofKind.map((goal) => (
                          <option key={goal.id} value={goal.id}>
                            {goalChipLabel(goal)}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
                <button type="submit" className="btn small" disabled={save.isPending || drafts[kind].trim() === ""}>
                  + 추가
                </button>
              </form>
            </section>
          );
        })}
      </div>

      <ReviewDraftBar flow={coach} state={coachState} review={review} save={save.mutateAsync} />

      <section className="card" style={{ marginTop: 14 }}>
        <strong>회고 마무리</strong>
        <div className="mini" style={{ marginBottom: 10 }}>
          완료 처리해도 언제든 다시 수정할 수 있습니다.
        </div>
        <div className="review-rating">
          <span className="mini" style={{ marginRight: 4 }}>
            이번 기간 만족도
          </span>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className={`rating-btn${rating === value ? " active" : ""}`}
              aria-pressed={rating === value}
              disabled={save.isPending}
              onClick={() => persist({ rating: rating === value ? null : value })}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="review-complete">
          <span className="mini">
            {save.isPending ? "저장 중…" : "KPT와 만족도는 입력하는 즉시 저장됩니다."}
          </span>
          <button type="button" className="btn" disabled={save.isPending} onClick={() => persist({ completed: !completed })}>
            {completed ? "회고 다시 열기" : "회고 완료"}
          </button>
        </div>
        {completed && <span className="review-status done">✓ 작성 완료</span>}
      </section>
    </>
  );
}

/** A short inline Goal list for one line: pick a candidate, clear the link, or cancel. */
function GoalPicker({
  label,
  candidates,
  current,
  emptyText,
  clearLabel,
  disabled,
  onPick,
  onCancel,
}: {
  label: string;
  candidates: AnyGoalResponse[];
  /** The linked Goal, shown even if it is no longer a candidate (e.g. its period was edited). */
  current?: AnyGoalResponse;
  emptyText: string;
  clearLabel?: string;
  disabled: boolean;
  onPick: (goalId: string | null) => void;
  onCancel: () => void;
}) {
  const options = current && !candidates.some((goal) => goal.id === current.id) ? [current, ...candidates] : candidates;
  return (
    <div className="kpt-goal-picker" role="group" aria-label={label}>
      <span className="mini">{label}</span>
      {options.length === 0 ? (
        <span className="mini">{emptyText}</span>
      ) : (
        options.map((goal) => (
          <button
            key={goal.id}
            type="button"
            className={`kpt-goal-option${current?.id === goal.id ? " active" : ""}`}
            aria-pressed={current?.id === goal.id}
            disabled={disabled}
            onClick={() => onPick(goal.id)}
          >
            {goalChipLabel(goal)}
          </button>
        ))
      )}
      {current && clearLabel && (
        <button type="button" className="btn ghost small" disabled={disabled} onClick={() => onPick(null)}>
          {clearLabel}
        </button>
      )}
      <button type="button" className="btn ghost small" onClick={onCancel}>
        닫기
      </button>
    </div>
  );
}
