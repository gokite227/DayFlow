"use client";

import type {
  ApplyCarryOverResponse,
  ApplyRecoveryResponse,
  CarryOverPreviewResponse,
  DayResponse,
  GoalResponse,
  RecoveryCandidateResponse,
  RecoveryDayResponse,
  RecoveryRecommendation,
} from "@dayflow/api-client";
import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/query-state";
import { addDays, formatKoreanDate } from "@/features/calendar/calendar-time";
import { useDays } from "@/features/days/day-queries";
import { DayTagPills } from "@/features/days/day-tag-pills";
import { DAY_PRIORITY_LABEL, DAY_STATUS_LABEL, describeDaySchedule } from "@/features/days/day-values";
import { goalPeriodLabel } from "@/features/goals/goal-period";
import { useGoals } from "@/features/goals/goal-queries";
import { GOAL_TYPE_LABEL } from "@/features/goals/goal-tree";
import { usePeriodGoals } from "@/features/goals/period-goal-queries";
import { goalChipLabel } from "@/features/review/review-goals";
import { isOpen } from "@/features/review/review-summary";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, isStaleDataError } from "@/lib/api-error";
import { browserTimezone } from "@/features/today/today-coach-flow";
import {
  RECOVERY_COACH_ERROR_COPY,
  createRecoveryCoachFlow,
  draftFromRecommendation,
  recommendationFor,
  recommendationUsable,
  type RecoveryCoachFlow,
  type RecoveryCoachState,
} from "./recovery-coach-flow";
import { useToday } from "@/lib/use-today";
import {
  CARRY_OVER_MODES,
  CARRY_OVER_MODE_LABEL,
  PERIOD_CARRY_OVER_BLOCKED,
  RECOVERY_ACTIONS,
  RECOVERY_ACTION_LABEL,
  SKIP_THIS_TIME,
  SKIP_THIS_TIME_LABEL,
  batchDays,
  defaultCarryOverDate,
  draftProblem,
  groupRecoveryDays,
  hasChangesToApply,
  historyDetail,
  initialDraft,
  moveRange,
  overridesToChoices,
  previewLines,
  recoveryActionBlockedReason,
  shortDate,
  skippedDays,
  summarizeCarryOver,
  toApplyCarryOverRequest,
  toApplyRequest,
  type CarryOverLevel,
  type CarryOverMode,
  type LevelChoice,
  type MoveRange,
  type RecoveryDraft,
} from "./recovery-plan";
import {
  useApplyCarryOver,
  useApplyRecovery,
  useCarryOverPreview,
  useDeleteRecoveryDay,
  useRecoveryCandidates,
  useRecoveryDays,
  useRecoveryEvents,
  useSaveRecoveryDay,
} from "./recovery-queries";

const PROBLEM_MESSAGE = {
  reduceMinutes: "지금 예상 시간보다 작은 값으로 정해주세요.",
  reduceTitle: "제목을 비워둘 수 없어요.",
  moveDate: "고를 수 있는 날짜 범위 안에서 정해주세요.",
} as const;

const REASON_LABEL: Record<RecoveryCandidateResponse["reason"], string> = {
  PAST_DATE: "지난 날짜의 계획",
  TIME_PASSED: "오늘 계획한 시간이 지났어요",
};

/**
 * REC-001/REC-002/REC-005: /recovery is always open. It has three parts: tidying missed plans,
 * managing Recovery Days ahead of time, and looking back at earlier decisions.
 */
export function RecoveryView() {
  const today = useToday();
  return (
    <>
      <PageHeader
        title="Recovery"
        subtitle="계획이 어긋나도 괜찮아요. 무엇을 남길지 정하고 다시 일상 계획으로 돌아와요."
        action={today && <span className="pill">{formatKoreanDate(today)}</span>}
      />
      {today === null ? (
        <LoadingState />
      ) : (
        <div className="stack">
          <MissedDaysSection today={today} />
          <RecoveryDayManager today={today} />
          <RecoveryHistory />
        </div>
      )}
    </>
  );
}

/** A snapshot of what the user confirmed: apply sends exactly these Day versions. */
interface Preview {
  days: DayResponse[];
  drafts: Record<string, RecoveryDraft>;
}

function MissedDaysSection({ today }: { today: string }) {
  const candidatesQuery = useRecoveryCandidates(today);
  const goalsQuery = useGoals();
  const periodGoalsQuery = usePeriodGoals();
  const apply = useApplyRecovery();
  const [drafts, setDrafts] = useState<Record<string, RecoveryDraft>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<ApplyRecoveryResponse | null>(null);
  const [carried, setCarried] = useState<ApplyCarryOverResponse | null>(null);
  // AI 정리 코치: recommendations only pre-fill a Day's choice; the existing preview and apply do the rest.
  const [coach] = useState(() =>
    createRecoveryCoachFlow({
      requestRecommendations: (body) => expectData(getDayFlowApiClient().POST("/api/v1/ai/coach/recovery", { body })),
    }),
  );
  const coachState = useSyncExternalStore(coach.subscribe, coach.getState, coach.getState);
  // Carry Over dates chosen through a recommendation (the panel starts there instead of its default).
  const [carryDates, setCarryDates] = useState<Record<string, string>>({});

  // Both kinds: a PERIOD Goal bounds MOVE the same way a WEEK Goal does.
  const goalsById = new Map<string, GoalResponse>(
    [...(goalsQuery.data ?? []), ...(periodGoalsQuery.data ?? [])].map((goal) => [goal.id, goal]),
  );
  const candidates = candidatesQuery.data ?? [];
  const missed = candidates.map((candidate) => candidate.day);
  // A Day without a Goal has no Goal period, so MOVE is only bounded by today (DAY-001).
  const goalOf = (day: DayResponse) => (day.goalId === null ? undefined : goalsById.get(day.goalId));
  const rangeOf = (day: DayResponse) => moveRange(goalOf(day), today);
  const draftOf = (day: DayResponse) => drafts[day.id] ?? initialDraft(day, rangeOf(day)?.min ?? null);
  const currentDrafts = Object.fromEntries(missed.map((day) => [day.id, draftOf(day)]));
  const batch = batchDays(missed, currentDrafts);
  const skipped = skippedDays(missed, currentDrafts);
  const hasProblem = batch.some((day) => draftProblem(day, draftOf(day), rangeOf(day)) !== null);
  const [nothingToApply, setNothingToApply] = useState(false);

  const updateDraft = (day: DayResponse, change: Partial<RecoveryDraft>) =>
    setDrafts((current) => ({ ...current, [day.id]: { ...draftOf(day), ...change } }));

  /** The existing preview, for one Day only: other Days are neither changed nor recorded. */
  const openSinglePreview = (day: DayResponse, draft: RecoveryDraft) => {
    apply.reset();
    setApplied(null);
    setCarried(null);
    setNothingToApply(false);
    setPreview({ days: [day], drafts: { [day.id]: draft } });
  };

  const chooseRecommendation = (day: DayResponse, recommendation: RecoveryRecommendation) => {
    const draft = draftFromRecommendation(recommendation, draftOf(day));
    setDrafts((current) => ({ ...current, [day.id]: draft }));
    if (recommendation.action === "CARRY_OVER" && recommendation.targetDate) {
      setCarryDates((current) => ({ ...current, [day.id]: recommendation.targetDate as string }));
    }
    return draft;
  };

  const openPreview = () => {
    apply.reset();
    setApplied(null);
    setCarried(null);
    setNothingToApply(false);
    // Carry Over Days are handled in their own panel; skipped ones stay listed as "변경 없음".
    setPreview({ days: missed.filter((day) => currentDrafts[day.id]?.action !== "CARRY_OVER"), drafts: currentDrafts });
  };

  const confirm = (snapshot: Preview) => {
    // Everything skipped: no decision to record, so no request at all.
    if (!hasChangesToApply(snapshot.days, snapshot.drafts)) {
      setNothingToApply(true);
      return;
    }
    apply.mutate(toApplyRequest(today, snapshot.days, snapshot.drafts), {
      onSuccess: (response) => {
        setApplied(response);
        setPreview(null);
        // Carry Over and "이번엔 건너뛰기" choices stay: those Days were not part of this apply.
        setDrafts((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([, draft]) => draft.action === "CARRY_OVER" || draft.action === SKIP_THIS_TIME),
          ),
        );
      },
      onError: (error) => {
        // Someone changed a Day after the preview: go back so the user reviews the latest state.
        if (isStaleDataError(error)) setPreview(null);
      },
    });
  };

  if (preview) {
    return <PreviewCard preview={preview} pending={apply.isPending} error={apply.error} nothingToApply={nothingToApply} onBack={() => setPreview(null)} onConfirm={confirm} />;
  }

  return (
    <section className="card" aria-label="놓친 계획 정리">
      <h3 className="card-title">놓친 계획 정리</h3>
      <div className="mini" style={{ marginBottom: 12 }}>
        지난 날짜의 계획과, 오늘 시간이 이미 지난 계획이에요. 하나씩 어떻게 할지 골라주세요. 자동으로 옮기지 않아요.
      </div>
      {applied && (
        <div className="notice success" style={{ marginBottom: 12 }} role="status">
          다시 정리했어요. Day {applied.days.length}개에 반영했습니다. <Link href="/today">Today로 돌아가기</Link>
        </div>
      )}
      {carried && (
        <div className="notice success" style={{ marginBottom: 12 }} role="status">
          다음 계획으로 이어갔어요. 새 Day {carried.days.length}개
          {carried.createdGoals.length > 0 ? `, 새 목표 ${carried.createdGoals.length}개` : ""}를 만들었어요. 원래 계획은 기록으로 남아요.
        </div>
      )}
      {apply.error ? (
        <div style={{ marginBottom: 12 }}>
          <ErrorNotice error={apply.error} />
        </div>
      ) : null}
      {missed.length > 0 && <RecoveryCoachCard flow={coach} state={coachState} today={today} />}
      {candidatesQuery.isPending || goalsQuery.isPending || periodGoalsQuery.isPending ? (
        <LoadingState />
      ) : candidatesQuery.isError ? (
        <ErrorNotice error={candidatesQuery.error} onRetry={() => void candidatesQuery.refetch()} />
      ) : goalsQuery.isError ? (
        <ErrorNotice error={goalsQuery.error} onRetry={() => void goalsQuery.refetch()} />
      ) : periodGoalsQuery.isError ? (
        <ErrorNotice error={periodGoalsQuery.error} onRetry={() => void periodGoalsQuery.refetch()} />
      ) : missed.length === 0 ? (
        <EmptyState>
          지금 다시 정리할 계획이 없어요. <Link href="/today">Today</Link>에서 오늘 계획을 이어가세요.
        </EmptyState>
      ) : (
        <>
          <div className="recovery-list">
            {candidates.map((candidate) => (
              <MissedDayRow
                key={candidate.day.id}
                candidate={candidate}
                today={today}
                goal={goalOf(candidate.day)}
                draft={draftOf(candidate.day)}
                range={rangeOf(candidate.day)}
                recommendation={(() => {
                  const recommendation = recommendationFor(coachState.result, candidate.day.id);
                  return recommendation &&
                    recommendationUsable(recommendation, candidate.day, goalOf(candidate.day), rangeOf(candidate.day), today)
                    ? recommendation
                    : null;
                })()}
                carryOverDate={carryDates[candidate.day.id]}
                onUseRecommendation={(recommendation) => chooseRecommendation(candidate.day, recommendation)}
                onPreviewRecommendation={(recommendation) =>
                  openSinglePreview(candidate.day, chooseRecommendation(candidate.day, recommendation))
                }
                onChange={(change) => updateDraft(candidate.day, change)}
                onCarried={(result) => {
                  setApplied(null);
                  setCarried(result);
                  setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== candidate.day.id)));
                }}
              />
            ))}
          </div>
          <div className="modal-footer">
            <span className="mini">
              {hasProblem
                ? "입력을 확인해주세요."
                : [
                    `정리할 Day ${batch.length}개`,
                    skipped.length > 0 ? `이번엔 건너뛰는 Day ${skipped.length}개` : null,
                    batch.length + skipped.length < missed.length ? "이어가기는 각 Day에서 따로 확인해요" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
            <div className="end">
              <button type="button" className="btn" disabled={hasProblem || batch.length + skipped.length === 0} onClick={openPreview}>
                변경 미리보기
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function MissedDayRow({
  candidate,
  today,
  goal,
  draft,
  range,
  recommendation,
  carryOverDate,
  onUseRecommendation,
  onPreviewRecommendation,
  onChange,
  onCarried,
}: {
  candidate: RecoveryCandidateResponse;
  today: string;
  goal: GoalResponse | undefined;
  draft: RecoveryDraft;
  range: MoveRange | null;
  recommendation: RecoveryRecommendation | null;
  carryOverDate: string | undefined;
  onUseRecommendation: (recommendation: RecoveryRecommendation) => void;
  onPreviewRecommendation: (recommendation: RecoveryRecommendation) => void;
  onChange: (change: Partial<RecoveryDraft>) => void;
  onCarried: (result: ApplyCarryOverResponse) => void;
}) {
  const { day } = candidate;
  const problem = draftProblem(day, draft, range);
  const disabledReason = (action: RecoveryDraft["action"]) => recoveryActionBlockedReason(action, day, goal, range);
  const periodGoal = goal?.kind === "PERIOD";

  return (
    <div className="recovery-row" data-day-id={day.id}>
      <div className="recovery-row-head">
        <div>
          <strong>{day.title}</strong>
          {day.coreDay && <span className="core-badge">핵심</span>}
          {day.priority !== "NONE" && (
            <span className={`priority-badge ${day.priority.toLowerCase()}`} style={{ marginLeft: 6 }}>
              {DAY_PRIORITY_LABEL[day.priority]}
            </span>
          )}
          <div className="mini">
            {describeDaySchedule(day)} · {day.estimatedMinutes}분 · {goal ? goalChipLabel(goal) : "목표 없음"}
          </div>
          <div className="recovery-row-meta">
            <span className="mini">{REASON_LABEL[candidate.reason]}</span>
            {candidate.lastAction && (
              <span className="mini">
                · 전에 &lsquo;{RECOVERY_ACTION_LABEL[candidate.lastAction]}&rsquo;로 정리했지만 계획이 바뀌었어요
              </span>
            )}
            <DayTagPills tags={day.tags} max={3} />
          </div>
        </div>
        <span className="mini">{DAY_STATUS_LABEL[day.status]}</span>
      </div>

      {recommendation && (
        <div className="recovery-recommendation" aria-label={`${day.title} AI 추천`}>
          <div>
            <span className="kpt-draft-badge">
              AI 추천 · {RECOVERY_ACTION_LABEL[recommendation.action]}
              {recommendation.targetDate ? ` · ${shortDate(recommendation.targetDate)}` : ""}
            </span>
            <div className="mini">{recommendation.reason}</div>
          </div>
          <span className="coach-actions">
            <button type="button" className="btn ghost small" onClick={() => onUseRecommendation(recommendation)}>
              추천대로 선택
            </button>
            {recommendation.action !== "CARRY_OVER" && (
              <button type="button" className="btn small" onClick={() => onPreviewRecommendation(recommendation)}>
                이 Day만 미리보기
              </button>
            )}
          </span>
          {recommendation.action === "CARRY_OVER" && draft.action === "CARRY_OVER" && (
            <div className="mini">아래 이어가기 미리보기에서 확인한 뒤 적용해요.</div>
          )}
        </div>
      )}

      <div className="recovery-actions" role="radiogroup" aria-label={`${day.title} 정리 방법`}>
        {RECOVERY_ACTIONS.map((action) => {
          const reason = disabledReason(action);
          return (
            <button
              key={action}
              type="button"
              role="radio"
              aria-checked={draft.action === action}
              className={draft.action === action ? "active" : undefined}
              disabled={reason !== null}
              title={reason ?? undefined}
              onClick={() => onChange({ action })}
            >
              {RECOVERY_ACTION_LABEL[action]}
            </button>
          );
        })}
        {/* Not a Recovery action: the Day is simply left out of this apply. */}
        <span className="recovery-actions-divider" aria-hidden="true" />
        <button
          type="button"
          role="radio"
          aria-checked={draft.action === SKIP_THIS_TIME}
          className={`skip${draft.action === SKIP_THIS_TIME ? " active" : ""}`}
          onClick={() => onChange({ action: SKIP_THIS_TIME })}
        >
          {SKIP_THIS_TIME_LABEL}
        </button>
      </div>

      {draft.action === "KEEP" && <div className="mini" style={{ marginTop: 8 }}>날짜와 내용을 바꾸지 않아요. 계획이 바뀌기 전까지 다시 묻지 않아요.</div>}

      {draft.action === SKIP_THIS_TIME && (
        <div className="mini" style={{ marginTop: 8 }}>
          이번 정리에서는 빼둘게요. 아무것도 바꾸거나 기록하지 않고, 다음에 다시 보여드려요.
        </div>
      )}

      {draft.action === "REDUCE" && (
        <div className="recovery-fields">
          <label className="field">
            <span className="field-label">예상 시간(분) · 지금 {day.estimatedMinutes}분</span>
            <input
              type="number"
              min={1}
              max={day.estimatedMinutes - 1}
              value={Number.isNaN(draft.estimatedMinutes) ? "" : draft.estimatedMinutes}
              onChange={(event) => onChange({ estimatedMinutes: event.target.valueAsNumber })}
            />
          </label>
          <label className="field">
            <span className="field-label">제목 (작게 바꿔도 좋아요)</span>
            <input maxLength={200} value={draft.title} onChange={(event) => onChange({ title: event.target.value })} />
          </label>
        </div>
      )}

      {draft.action === "MOVE" && range && (
        <div className="recovery-fields">
          <label className="field">
            <span className="field-label">
              {range.max
                ? periodGoal
                  ? "기간 목표 안의 새 날짜 (시간 배치는 해제돼요)"
                  : "이번 주 안의 새 날짜 (시간 배치는 해제돼요)"
                : "오늘 이후의 새 날짜 (시간 배치는 해제돼요)"}
            </span>
            <input
              type="date"
              aria-label={`${day.title} 새 날짜`}
              min={range.min}
              max={range.max ?? undefined}
              value={draft.plannedDate}
              onChange={(event) => onChange({ plannedDate: event.target.value })}
            />
          </label>
        </div>
      )}

      {range === null && draft.action !== "CARRY_OVER" && (
        <div className="mini" style={{ marginTop: 8 }}>
          {periodGoal ? (
            "기간 목표가 끝났어요. 다른 날에 다시 하려면 Day에서 목표 연결을 해제한 뒤 날짜를 바꿔주세요."
          ) : (
            <>이 주간 목표 기간이 지났어요. 다른 주에 다시 하려면 &lsquo;다음 계획으로 이어가기&rsquo;를 골라주세요.</>
          )}
        </div>
      )}

      {periodGoal && (
        <div className="mini" style={{ marginTop: 8 }} data-carry-over-blocked>
          {PERIOD_CARRY_OVER_BLOCKED}
        </div>
      )}

      {draft.action === "CARRY_OVER" && goal && !periodGoal && (
        <CarryOverPanel
          key={carryOverDate ?? "default"}
          day={day}
          weekGoal={goal}
          today={today}
          initialTargetDate={carryOverDate}
          onCarried={onCarried}
        />
      )}

      {draft.action === "DROP" && (
        <div className="mini" style={{ marginTop: 8 }}>
          상태를 &apos;건너뜀&apos;으로 바꿔요. 삭제하지 않으니 Review에서 기록을 다시 볼 수 있어요.
        </div>
      )}

      {problem && (
        <div className="field-error" style={{ marginTop: 6 }}>
          {PROBLEM_MESSAGE[problem]}
        </div>
      )}
    </div>
  );
}

/**
 * REC-003/REC-004 "다음 계획으로 이어가기": the user picks a new date and a way to continue; DayFlow
 * works out the Goals of that date and shows what would be reused or created. Nothing changes until
 * "확인하고 적용".
 */
function CarryOverPanel({
  day,
  weekGoal,
  today,
  initialTargetDate,
  onCarried,
}: {
  day: DayResponse;
  weekGoal: GoalResponse;
  today: string;
  /** A date picked through an AI recommendation; the user can still change it. */
  initialTargetDate?: string;
  onCarried: (result: ApplyCarryOverResponse) => void;
}) {
  const [targetDate, setTargetDate] = useState(initialTargetDate ?? defaultCarryOverDate(weekGoal, today));
  const [mode, setMode] = useState<CarryOverMode>("DAY_ONLY");
  const [weekGoalId, setWeekGoalId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<CarryOverLevel["type"], LevelChoice>>>({});
  const [extraDayIds, setExtraDayIds] = useState<string[]>([]);
  const apply = useApplyCarryOver();

  const inSourceWeek = targetDate >= weekGoal.startDate && targetDate <= weekGoal.endDate;
  const dateProblem =
    targetDate === "" ? "새 날짜를 골라주세요." : targetDate < today ? "오늘 이후 날짜를 골라주세요." : inSourceWeek ? "같은 주 안에서는 '날짜 바꾸기'를 써요." : null;
  const body =
    dateProblem === null
      ? {
          localDate: today,
          sourceDayId: day.id,
          targetDate,
          mode,
          targetWeekGoalId: mode === "DAY_ONLY" ? weekGoalId : null,
          levels: mode === "WITH_PLAN" ? overridesToChoices(overrides) : [],
          dayIds: mode === "WITH_PLAN" ? extraDayIds : [],
        }
      : null;
  const previewQuery = useCarryOverPreview(body);
  const preview = body ? previewQuery.data : undefined;

  const reset = () => {
    apply.reset();
    setWeekGoalId(null);
    setOverrides({});
    setExtraDayIds([]);
  };

  const confirm = (current: CarryOverPreviewResponse) =>
    apply.mutate(toApplyCarryOverRequest(today, current), { onSuccess: onCarried });

  return (
    <div className="carry-over" aria-label={`${day.title} 다음 계획으로 이어가기`}>
      <div className="recovery-fields">
        <label className="field">
          <span className="field-label">새 계획 날짜</span>
          <input
            type="date"
            aria-label="새 계획 날짜"
            min={today}
            value={targetDate}
            onChange={(event) => {
              reset();
              setTargetDate(event.target.value);
            }}
          />
        </label>
        <div className="field">
          <span className="field-label">이어가는 방식</span>
          <div className="carry-over-modes" role="radiogroup" aria-label="이어가는 방식">
            {CARRY_OVER_MODES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                className={mode === value ? "active" : undefined}
                onClick={() => {
                  reset();
                  setMode(value);
                }}
              >
                {CARRY_OVER_MODE_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {dateProblem && <div className="field-error">{dateProblem}</div>}
      {body && previewQuery.isError && !preview ? (
        <ErrorNotice error={previewQuery.error} onRetry={() => void previewQuery.refetch()} />
      ) : null}
      {body && previewQuery.isPending && <LoadingState label="새 계획을 계산하는 중…" />}

      {preview && (
        <div className="carry-over-preview" aria-label="이어가기 미리보기">
          <div className="carry-over-line">
            <span className="field-label">원래 계획</span>
            <span>{preview.sourceGoalPath.map((goal) => goalChipLabel(goal)).join(" › ")}</span>
          </div>
          <div className="carry-over-line">
            <span className="field-label">새 계획 날짜</span>
            <span>{shortDate(preview.targetDate)}</span>
          </div>

          {preview.mode === "DAY_ONLY" &&
            (preview.targetWeekGoals.length === 0 ? (
              <div className="review-note">
                이 날짜에 이어갈 주간 목표가 아직 없어요. &lsquo;계획 구조와 함께 이어가기&rsquo;로 목표를 함께 만들거나,
                &lsquo;Goal 연결 없이 넘기기&rsquo;를 골라주세요.
              </div>
            ) : (
              <label className="field">
                <span className="field-label">이어갈 주간 목표</span>
                <select
                  aria-label="이어갈 주간 목표"
                  value={preview.targetWeekGoalId ?? ""}
                  onChange={(event) => setWeekGoalId(event.target.value === "" ? null : event.target.value)}
                >
                  {preview.targetWeekGoalId === null && <option value="">선택해주세요</option>}
                  {preview.targetWeekGoals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goalChipLabel(goal)}
                    </option>
                  ))}
                </select>
              </label>
            ))}

          {preview.mode === "WITH_PLAN" && (
            <div className="carry-over-levels">
              {preview.levels.map((level) => (
                <CarryOverLevelRow
                  key={level.type}
                  level={level}
                  choice={overrides[level.type]}
                  onChoose={(choice) => setOverrides((current) => ({ ...current, [level.type]: choice }))}
                />
              ))}
            </div>
          )}

          {preview.mode === "WITH_PLAN" && preview.days.length > 1 && (
            <div className="carry-over-days">
              <span className="field-label">함께 가져갈 미완료 항목</span>
              {preview.days.map((entry) => (
                <label key={entry.day.id} className={entry.selectable ? undefined : "muted"}>
                  <input
                    type="checkbox"
                    checked={entry.selected}
                    disabled={!entry.selectable || entry.day.id === day.id}
                    onChange={() =>
                      setExtraDayIds((current) =>
                        current.includes(entry.day.id)
                          ? current.filter((id) => id !== entry.day.id)
                          : [...current, entry.day.id],
                      )
                    }
                  />
                  {entry.day.title}
                  <span className="mini">
                    {entry.exclusion === "FINISHED"
                      ? ` · ${DAY_STATUS_LABEL[entry.day.status]} 상태라 가져가지 않아요`
                      : entry.exclusion === "ALREADY_CARRIED"
                        ? " · 이미 다음 계획으로 이어갔어요"
                        : entry.day.plannedDate
                          ? ` · ${shortDate(entry.day.plannedDate)}`
                          : ""}
                  </span>
                </label>
              ))}
            </div>
          )}

          <CarryOverSummaryNote preview={preview} />

          {apply.error ? <ErrorNotice error={apply.error} /> : null}
          <div className="modal-footer">
            <span className="mini">확인을 누르기 전까지는 아무것도 바뀌지 않아요.</span>
            <div className="end">
              <button
                type="button"
                className="btn"
                disabled={!preview.ready || apply.isPending || previewQuery.isFetching}
                onClick={() => confirm(preview)}
              >
                {apply.isPending ? "적용 중…" : "확인하고 적용"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CarryOverLevelRow({
  level,
  choice,
  onChoose,
}: {
  level: CarryOverLevel;
  choice: LevelChoice | undefined;
  onChoose: (choice: LevelChoice) => void;
}) {
  const period = `${GOAL_TYPE_LABEL[level.type]} · ${goalPeriodLabel(level, true)}`;
  if (level.action === "KEEP_SOURCE") {
    return (
      <div className="carry-over-level">
        <span className="field-label">{period}</span>
        <span>그대로 사용 · {level.goal?.title}</span>
      </div>
    );
  }
  const value = choice ?? (level.action === "REUSE" ? (level.goal?.id ?? "") : level.action === "CREATE" ? "new" : "");
  return (
    <div className="carry-over-level">
      <span className="field-label">{period}</span>
      {level.candidates.length === 0 ? (
        <span>
          <span className="goal-type">새로 만들기</span> {level.newTitle}
          {level.sourceGoal ? <span className="mini"> · {goalChipLabel(level.sourceGoal)}에서 이어감</span> : null}
        </span>
      ) : (
        <select aria-label={`${period} 목표`} value={value} onChange={(event) => onChoose(event.target.value)}>
          {value === "" && <option value="">어떤 목표로 이어갈지 골라주세요</option>}
          {level.candidates.map((goal) => (
            <option key={goal.id} value={goal.id}>
              기존 목표 사용 · {goal.title}
            </option>
          ))}
          <option value="new">새로 만들기 · {level.sourceGoal?.title ?? level.newTitle ?? ""}</option>
        </select>
      )}
    </div>
  );
}

function CarryOverSummaryNote({ preview }: { preview: CarryOverPreviewResponse }) {
  const summary = summarizeCarryOver(preview);
  return (
    <div className="review-note">
      {summary.withoutGoal
        ? `목표 없이 ${shortDate(preview.targetDate)}에 새 Day를 만들어요.`
        : `새 Day ${summary.days.length}개를 ${shortDate(preview.targetDate)}에 만들어요.`}
      {summary.newGoals.length > 0 &&
        ` 새 목표 ${summary.newGoals.length}개(${summary.newGoals.map((level) => GOAL_TYPE_LABEL[level.type]).join(", ")})를 함께 만들어요.`}
      {" "}원래 Day는 날짜와 상태 그대로 기록으로 남고, 새 Day가 원래 Day를 가리켜요. 시간 배치와 핵심 표시는 가져가지 않아요.
    </div>
  );
}

/** "AI 정리 코치": asked only on tap; the result only shows recommendations next to each Day. */
function RecoveryCoachCard({ flow, state, today }: { flow: RecoveryCoachFlow; state: RecoveryCoachState; today: string }) {
  const ask = () => void flow.request({ localDate: today, timezone: browserTimezone() });
  const result = state.result;
  return (
    <div className="coach-card recovery-coach-card" aria-label="AI 정리 코치" aria-busy={state.status === "loading"}>
      <div className="coach-head">
        <strong>AI 정리 코치</strong>
        {state.status === "success" && (
          <button type="button" className="btn ghost small" onClick={ask}>
            다시 받기
          </button>
        )}
      </div>
      {state.status === "idle" && (
        <div className="coach-intro">
          <p>남은 Day와 최근 정리 기록을 보고 현실적인 선택을 제안해드려요.</p>
          <button type="button" className="btn small" onClick={ask}>
            AI 정리 제안 받기
          </button>
        </div>
      )}
      {state.status === "loading" && (
        <div className="coach-loading" role="status">
          <span className="coach-spinner" aria-hidden />
          남은 Day를 살펴보고 있어요...
        </div>
      )}
      {state.status === "error" && state.error && (
        <div className="notice error coach-error" role="alert">
          <span>{RECOVERY_COACH_ERROR_COPY[state.error]}</span>
          {state.error !== "unavailable" && (
            <button type="button" className="btn ghost small" onClick={ask}>
              다시 시도
            </button>
          )}
        </div>
      )}
      {state.status === "success" && result && (
        <div className="coach-result">
          <div>
            <strong className="coach-headline">{result.headline}</strong>
            {result.summary && <p className="coach-summary">{result.summary}</p>}
          </div>
          {result.observations.length > 0 && (
            <ul className="coach-list">
              {result.observations.map((observation, index) => (
                <li key={index}>{observation.message}</li>
              ))}
            </ul>
          )}
          <span className="mini">
            추천 {result.recommendations.length}개
            {result.reviewedCount < result.candidateCount ? ` · 정리할 Day ${result.candidateCount}개 중 ${result.reviewedCount}개를 살펴봤어요` : ""}
            {" "}· 추천은 각 Day 아래에 보여요. 적용 전 미리보기를 꼭 거쳐요.
          </span>
        </div>
      )}
    </div>
  );
}

function PreviewCard({
  preview,
  pending,
  error,
  nothingToApply,
  onBack,
  onConfirm,
}: {
  preview: Preview;
  pending: boolean;
  error: unknown;
  nothingToApply: boolean;
  onBack: () => void;
  onConfirm: (preview: Preview) => void;
}) {
  const lines = previewLines(preview.days, preview.drafts);
  const keepCount = batchDays(preview.days, preview.drafts).length - lines.length;
  const skipped = skippedDays(preview.days, preview.drafts);
  const hasChanges = hasChangesToApply(preview.days, preview.drafts);
  return (
    <section className="card" aria-label="변경 미리보기">
      <h3 className="card-title">이번 계획을 다시 정리할까요?</h3>
      <div className="mini">확인을 누르기 전까지는 아무것도 바뀌지 않아요.</div>
      {error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorNotice error={error} />
        </div>
      ) : null}
      {lines.length > 0 && (
        <div className="preview-list">
          {lines.map((line) => (
            <div key={line.dayId} className="preview-row">
              <div>
                <strong>{line.title}</strong>
                <div className="mini">{line.detail}</div>
              </div>
              <span className="goal-type">{RECOVERY_ACTION_LABEL[line.action]}</span>
            </div>
          ))}
        </div>
      )}
      {hasChanges && (
        <div className="review-note" style={{ marginTop: 12 }}>
          {keepCount > 0 ? `그대로 두는 Day ${keepCount}개는 바뀌지 않고, 정리했다는 기록만 남아요.` : "정리할 Day에 모두 새 방향을 정했어요."}
        </div>
      )}
      {skipped.length > 0 && (
        <div className="preview-list" aria-label="이번엔 건너뛰는 Day">
          {skipped.map((day) => (
            <div key={day.id} className="preview-row skipped">
              <div>
                <strong>{day.title}</strong>
                <div className="mini">변경 없음 · 기록하지 않고 다음에 다시 보여드려요</div>
              </div>
              <span className="goal-type">{SKIP_THIS_TIME_LABEL}</span>
            </div>
          ))}
        </div>
      )}
      {nothingToApply && (
        <div className="notice" role="status" style={{ marginTop: 12 }}>
          적용할 변경이 없어요. 모두 이번엔 건너뛰기로 두었어요. 돌아가서 정리할 Day를 골라주세요.
        </div>
      )}
      <div className="modal-footer">
        <div className="end">
          <button type="button" className="btn secondary" onClick={onBack} disabled={pending}>
            돌아가서 고치기
          </button>
          <button type="button" className="btn" onClick={() => onConfirm(preview)} disabled={pending}>
            {pending ? "적용 중…" : "확인하고 적용"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** REC-002: Recovery Days for today, ahead of time, and the past ones — without needing a missed Day. */
function RecoveryDayManager({ today }: { today: string }) {
  const from = addDays(today, -90);
  const to = addDays(today, 365);
  const recoveryQuery = useRecoveryDays(from, to);
  const release = useDeleteRecoveryDay();
  const [editing, setEditing] = useState<{ date: string; existing: RecoveryDayResponse | null } | null>(null);

  const groups = groupRecoveryDays(recoveryQuery.data ?? [], today);
  const row = (day: RecoveryDayResponse) => (
    <div key={day.id} className="recovery-day-row" data-recovery-date={day.date}>
      <div>
        <strong>{shortDate(day.date)}</strong>
        <div className="mini">
          {day.returnDate ? `${shortDate(day.returnDate)}에 평소 계획으로 돌아와요` : "돌아올 날은 아직 정하지 않았어요"}
          {day.note ? ` · ${day.note}` : ""}
        </div>
      </div>
      <div className="end">
        <button type="button" className="btn ghost small" onClick={() => setEditing({ date: day.date, existing: day })}>
          수정
        </button>
        <button
          type="button"
          className="btn secondary small"
          disabled={release.isPending}
          onClick={() => {
            if (editing?.date === day.date) setEditing(null);
            release.mutate(day.date);
          }}
        >
          해제
        </button>
      </div>
    </div>
  );

  return (
    <section className="card" aria-label="Recovery Day 관리">
      <h3 className="card-title">Recovery Day 관리</h3>
      <div className="mini" style={{ marginBottom: 12 }}>
        시험·여행·큰 일정 다음처럼 쉬어갈 날을 미리 정해둘 수 있어요. 그날은 핵심 Day를 0~1개로 줄이고, 돌아올 날을 정해요.
      </div>
      {release.error ? <ErrorNotice error={release.error} /> : null}

      {recoveryQuery.isPending ? (
        <LoadingState />
      ) : recoveryQuery.isError ? (
        <ErrorNotice error={recoveryQuery.error} onRetry={() => void recoveryQuery.refetch()} />
      ) : (
        <div className="stack">
          {groups.today.length > 0 && (
            <div className="recovery-banner">
              <span>
                <strong>오늘은 Recovery Day예요.</strong> 천천히 회복해요.
              </span>
            </div>
          )}
          <RecoveryDayGroup title="오늘" days={groups.today} empty="오늘은 Recovery Day가 아니에요." render={row} />
          <RecoveryDayGroup title="예정된 Recovery Day" days={groups.upcoming} empty="예정된 Recovery Day가 없어요." render={row} />
          <RecoveryDayGroup title="지난 Recovery Day" days={groups.past} empty="최근 90일 동안의 Recovery Day가 없어요." render={row} />
        </div>
      )}

      {editing ? (
        <RecoveryDayForm
          key={`${editing.date}:${editing.existing?.version ?? "new"}`}
          today={today}
          initialDate={editing.date}
          existing={editing.existing}
          onDone={() => setEditing(null)}
        />
      ) : (
        <div className="modal-footer">
          <div className="end">
            <button type="button" className="btn secondary" onClick={() => setEditing({ date: addDays(today, 1), existing: null })}>
              다른 날짜를 Recovery Day로
            </button>
            {groups.today.length === 0 && (
              <button type="button" className="btn" onClick={() => setEditing({ date: today, existing: null })}>
                오늘을 Recovery Day로
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function RecoveryDayGroup({
  title,
  days,
  empty,
  render,
}: {
  title: string;
  days: RecoveryDayResponse[];
  empty: string;
  render: (day: RecoveryDayResponse) => ReactNode;
}) {
  return (
    <div>
      <div className="section-label">{title}</div>
      {days.length === 0 ? <div className="mini">{empty}</div> : <div className="recovery-day-list">{days.map(render)}</div>}
    </div>
  );
}

const NO_CORE = "none";

function RecoveryDayForm({
  today,
  initialDate,
  existing,
  onDone,
}: {
  today: string;
  initialDate: string;
  existing: RecoveryDayResponse | null;
  onDone: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [returnDate, setReturnDate] = useState(existing ? (existing.returnDate ?? "") : addDays(initialDate, 1));
  const [note, setNote] = useState(existing?.note ?? "");
  const [keepCoreId, setKeepCoreId] = useState<string | null>(null);
  const daysQuery = useDays({ from: date, to: date });
  const existingForDate = useRecoveryDays(date, date);
  const save = useSaveRecoveryDay();

  const coreDays = (daysQuery.data ?? []).filter((day) => day.coreDay && isOpen(day));
  const keep = keepCoreId ?? coreDays[0]?.id ?? NO_CORE;
  const current = existing ?? existingForDate.data?.[0] ?? null;
  const invalidReturn = returnDate !== "" && returnDate <= date;

  const submit = () =>
    save.mutate(
      {
        date,
        body: {
          returnDate: returnDate === "" ? null : returnDate,
          note: note.trim(),
          expectedVersion: current?.version ?? null,
          // Released in the same transaction as the Recovery Day itself.
          releaseCoreDays: coreDays.filter((day) => day.id !== keep).map((day) => ({ id: day.id, version: day.version })),
        },
      },
      { onSuccess: onDone },
    );

  return (
    <div className="recovery-day-form" aria-label="Recovery Day 설정">
      {save.error ? <ErrorNotice error={save.error} /> : null}
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Recovery Day</span>
          <input
            type="date"
            aria-label="Recovery Day 날짜"
            min={existing ? undefined : today}
            disabled={existing !== null}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setKeepCoreId(null);
              if (returnDate !== "" && returnDate <= event.target.value) setReturnDate(addDays(event.target.value, 1));
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">돌아올 날 (선택)</span>
          <input type="date" aria-label="돌아올 날" min={addDays(date, 1)} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} />
        </label>
        <label className="field wide">
          <span className="field-label">메모 (선택)</span>
          <input
            maxLength={500}
            aria-label="Recovery Day 메모"
            placeholder="예: 여행 후 회복"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      {invalidReturn && <div className="field-error">돌아올 날은 Recovery Day 다음 날부터 고를 수 있어요.</div>}

      {coreDays.length > 0 ? (
        <>
          <div className="field-label">이날 남길 핵심 Day (지금 {coreDays.length}개)</div>
          <div className="recovery-core-options" role="radiogroup" aria-label="이날 남길 핵심 Day">
            {coreDays.map((day) => (
              <label key={day.id}>
                <input type="radio" name="keep-core" checked={keep === day.id} onChange={() => setKeepCoreId(day.id)} />
                {day.title}만 핵심으로 남기기
              </label>
            ))}
            <label>
              <input type="radio" name="keep-core" checked={keep === NO_CORE} onChange={() => setKeepCoreId(NO_CORE)} />
              핵심 Day 없이 쉬어가기
            </label>
          </div>
          <div className="mini">나머지는 핵심 표시만 해제되고 Day는 그대로 남아요.</div>
        </>
      ) : (
        <div className="mini">이날 남아 있는 핵심 Day가 없어요.</div>
      )}

      <div className="modal-footer">
        <button type="button" className="btn secondary" onClick={onDone} disabled={save.isPending}>
          취소
        </button>
        <div className="end">
          <button type="button" className="btn" disabled={save.isPending || date === "" || invalidReturn || daysQuery.isPending} onClick={submit}>
            {save.isPending ? "저장 중…" : current ? "Recovery Day 저장" : `${shortDate(date || today)}을 Recovery Day로 정하기`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** REC-005: earlier decisions, read only. */
function RecoveryHistory() {
  const eventsQuery = useRecoveryEvents(30);
  return (
    <section className="card" aria-label="지난 정리 기록">
      <h3 className="card-title">지난 정리 기록</h3>
      <div className="mini" style={{ marginBottom: 12 }}>
        지금까지 어떻게 다시 정리했는지 돌아볼 수 있어요. 기록은 바뀌지 않아요.
      </div>
      {eventsQuery.isPending ? (
        <LoadingState />
      ) : eventsQuery.isError ? (
        <ErrorNotice error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()} />
      ) : eventsQuery.data.length === 0 ? (
        <EmptyState>아직 정리한 기록이 없어요.</EmptyState>
      ) : (
        <div className="recovery-history">
          {eventsQuery.data.map((event) => (
            <div key={event.id} className="recovery-history-event" data-event-id={event.id}>
              <div className="section-label">{shortDate(event.localDate)}에 정리</div>
              {event.items.map((item) => (
                <div key={item.id} className="preview-row">
                  <div>
                    <strong>{item.dayTitle ?? "삭제된 Day"}</strong>
                    <div className="mini">{historyDetail(item)}</div>
                  </div>
                  <span className="goal-type">{RECOVERY_ACTION_LABEL[item.action]}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
