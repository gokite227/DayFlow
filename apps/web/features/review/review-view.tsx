"use client";

import type { DayResponse, GoalResponse, ReviewItemResponse, ReviewResponse } from "@dayflow/api-client";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { addDays } from "@/features/calendar/calendar-time";
import { useDays } from "@/features/days/day-queries";
import { DAY_STATUS_LABEL, describeDaySchedule } from "@/features/days/day-values";
import { useGoals } from "@/features/goals/goal-queries";
import { GOAL_TYPE_LABEL, goalPath, sortGoals } from "@/features/goals/goal-tree";
import { useToday } from "@/lib/use-today";
import {
  REVIEW_GOAL_TYPE,
  REVIEW_TYPES,
  REVIEW_TYPE_LABEL,
  overlaps,
  reviewPeriod,
  shiftAnchor,
  type ReviewPeriod,
  type ReviewType,
} from "./review-period";
import { useReview, useSaveReview } from "./review-queries";
import { formatRate, isOpen, summarizeDays, summarizeGoal } from "./review-summary";
import { TryToDayModal } from "./try-to-day-modal";

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

function ReviewContent({ today }: { today: string }) {
  const [type, setType] = useState<ReviewType>("WEEK");
  const [anchor, setAnchor] = useState(today);
  const period = reviewPeriod(type, anchor);

  return (
    <>
      <PageHeader title="Review" subtitle="그 기간의 Goal과 기록을 먼저 보고 KPT 회고를 작성합니다." />

      <div className="goal-tabs" role="tablist" aria-label="회고 기간">
        {REVIEW_TYPES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={type === value}
            className={type === value ? "active" : undefined}
            onClick={() => setType(value)}
          >
            {REVIEW_TYPE_LABEL[value]}
          </button>
        ))}
      </div>

      <div className="review-period-nav">
        <button type="button" className="btn ghost small" aria-label="이전 기간" onClick={() => setAnchor(shiftAnchor(type, anchor, -1))}>
          ←
        </button>
        <div className="review-period-title">
          {REVIEW_TYPE_LABEL[type]} 회고 · {period.label}
        </div>
        <button type="button" className="btn ghost small" aria-label="다음 기간" onClick={() => setAnchor(shiftAnchor(type, anchor, 1))}>
          →
        </button>
      </div>

      {/* Remount per period so drafts and pending state never leak between periods. */}
      <ReviewPeriodContent key={`${period.type}:${period.start}`} period={period} today={today} />
    </>
  );
}

function ReviewPeriodContent({ period, today }: { period: ReviewPeriod; today: string }) {
  const goalsQuery = useGoals();
  const daysQuery = useDays({ from: period.start, to: period.end });
  const reviewQuery = useReview(period.type, period.start);
  const [convertingItem, setConvertingItem] = useState<ReviewItemResponse | null>(null);

  const goals = goalsQuery.data ?? [];
  const days = daysQuery.data ?? [];
  const periodGoals = sortGoals(goals.filter((goal) => goal.type === REVIEW_GOAL_TYPE[period.type] && overlaps(goal, period)));
  const summary = summarizeDays(days);
  const missedCount = days.filter((day) => day.plannedDate !== null && day.plannedDate < today && isOpen(day)).length;
  const weekGoals = sortGoals(goals.filter((goal) => goal.type === "WEEK"));
  const nextPlanDate = addDays(period.end, 1);
  const suggestedGoalId =
    weekGoals.find((goal) => goal.startDate <= nextPlanDate && nextPlanDate <= goal.endDate)?.id ?? "";

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
          <KptEditor period={period} review={reviewQuery.data} onConvert={setConvertingItem} />
        )}
      </div>

      {convertingItem && (
        <TryToDayModal
          item={convertingItem}
          weekGoals={weekGoals}
          suggestedGoalId={suggestedGoalId}
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

/** KPT, rating and completion. Every change saves the whole review with expectedVersion. */
function KptEditor({
  period,
  review,
  onConvert,
}: {
  period: ReviewPeriod;
  review: ReviewResponse | null;
  onConvert: (item: ReviewItemResponse) => void;
}) {
  const [drafts, setDrafts] = useState<Record<ItemKind, string>>({ KEEP: "", PROBLEM: "", TRY: "" });
  const save = useSaveReview(period.type, period.start);
  const items = review?.items ?? [];
  const completed = review?.completed ?? false;
  const rating = review?.rating ?? null;

  const persist = (
    next: { items?: { id: string | null; kind: ItemKind; content: string }[]; rating?: number | null; completed?: boolean },
    onSaved?: () => void,
  ) =>
    save.mutate(
      {
        rating: next.rating !== undefined ? next.rating : rating,
        completed: next.completed ?? completed,
        items: next.items ?? items.map(({ id, kind, content }) => ({ id, kind, content })),
        expectedVersion: review?.version ?? null,
      },
      { onSuccess: onSaved },
    );

  const addItem = (kind: ItemKind) => {
    const content = drafts[kind].trim();
    if (!content) return;
    persist(
      { items: [...items.map(({ id, kind: itemKind, content: text }) => ({ id, kind: itemKind, content: text })), { id: null, kind, content }] },
      () => setDrafts((current) => ({ ...current, [kind]: "" })),
    );
  };

  const removeItem = (itemId: string) =>
    persist({ items: items.filter((item) => item.id !== itemId).map(({ id, kind, content }) => ({ id, kind, content })) });

  return (
    <>
      {save.error && (
        <div style={{ marginBottom: 12 }}>
          <ErrorNotice error={save.error} />
        </div>
      )}
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
                {kindItems.length === 0 ? (
                  <div className="mini">아직 작성한 내용이 없습니다.</div>
                ) : (
                  kindItems.map((item) => (
                    <div key={item.id} className="kpt-item">
                      <div className="kpt-item-main">
                        <div className="kpt-item-content">{item.content}</div>
                        <button type="button" className="btn secondary small" onClick={() => removeItem(item.id)} disabled={save.isPending}>
                          삭제
                        </button>
                      </div>
                      {kind === "TRY" && (
                        <div className="kpt-item-actions">
                          {item.convertedDayId ? (
                            <span className="converted-badge">✓ 다음 계획에 추가됨</span>
                          ) : (
                            <button type="button" className="btn ghost small" onClick={() => onConvert(item)} disabled={save.isPending}>
                              다음 계획에 추가
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
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
                <button type="submit" className="btn small" disabled={save.isPending || drafts[kind].trim() === ""}>
                  + 추가
                </button>
              </form>
            </section>
          );
        })}
      </div>

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
