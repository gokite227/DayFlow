import type { ApplyCarryOverResponse, ApplyRecoveryResponse, CarryOverPreviewResponse, DayResponse, GoalResponse, RecoveryCandidateResponse, RecoveryDayResponse, RecoveryRecommendation } from "@dayflow/api-client";
import { useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useDays } from "@/features/days/day-queries";
import { DAY_PRIORITY_LABEL, DAY_STATUS_LABEL, describeDaySchedule } from "@/features/days/day-values";
import { GOAL_TYPE_LABEL, goalChipLabel, goalPeriodLabel, isOpenDay } from "@/features/goals/goal-helpers";
import { useGoals, usePeriodGoals } from "@/features/goals/goal-queries";
import {
  CARRY_OVER_MODES,
  CARRY_OVER_MODE_LABEL,
  DRAFT_PROBLEM_MESSAGE,
  RECOVERY_ACTIONS,
  RECOVERY_ACTION_LABEL,
  PERIOD_CARRY_OVER_BLOCKED,
  SKIP_THIS_TIME,
  SKIP_THIS_TIME_LABEL,
  actionUnavailableReason,
  batchDays,
  carryOverDateProblem,
  defaultCarryOverDate,
  draftProblem,
  groupRecoveryDays,
  historyDetail,
  initialDraft,
  moveRange,
  overridesToChoices,
  previewLines,
  skippedDays,
  toApplyCarryOverRequest,
  toApplyRequest,
  type CarryOverLevel,
  type CarryOverMode,
  type LevelChoice,
  type MoveRange,
  type RecoveryDraft,
} from "@/features/recovery/recovery-helpers";
import {
  useApplyCarryOver,
  useApplyRecovery,
  useCarryOverPreview,
  useDeleteRecoveryDay,
  useRecoveryCandidates,
  useRecoveryDays,
  useRecoveryEvents,
  useSaveRecoveryDay,
} from "@/features/recovery/recovery-queries";
import { expectData, isStaleDataError } from "@/lib/api-error";
import { getDayFlowApiClient } from "@/lib/api-client";
import {
  RECOVERY_COACH_ERROR_COPY,
  createRecoveryCoachFlow,
  draftFromRecommendation,
  recommendationFor,
  recommendationUsable,
  type RecoveryCoachFlow,
  type RecoveryCoachState,
} from "@/features/recovery/recovery-coach-flow";
import { addDays, deviceTimeZone, koreanShortDate } from "@/lib/dates";
import { useOpenScreen } from "@/features/navigation/use-open-screen";
import { useToday } from "@/lib/use-today";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, ErrorState, FieldLabel, layout, LoadingState, Notice, Screen, SectionHeader, TextField, useTextStyles } from "@/ui/components";
import { DateField } from "@/ui/date-fields";
import { spacing, usePalette } from "@/ui/theme";

const REASON_LABEL: Record<RecoveryCandidateResponse["reason"], string> = {
  PAST_DATE: "지난 날짜의 계획",
  TIME_PASSED: "오늘 계획한 시간이 지났어요",
};

/** REC-001/002/005: tidy missed plans, manage Recovery Days, look back at decisions. */
export default function RecoveryScreen() {
  const text = useTextStyles();
  const today = useToday();
  return (
    <Screen>
      <Text style={text.muted}>계획이 어긋나도 괜찮아요. 무엇을 남길지 정하고 다시 일상 계획으로 돌아와요. 자동으로 옮기지 않아요.</Text>
      <MissedDays today={today} />
      <RecoveryDayManager today={today} />
      <RecoveryHistory />
    </Screen>
  );
}

interface Preview {
  days: DayResponse[];
  drafts: Record<string, RecoveryDraft>;
}

function MissedDays({ today }: { today: string }) {
  const text = useTextStyles();
  const palette = usePalette();
  const openScreen = useOpenScreen();
  const candidatesQuery = useRecoveryCandidates(today);
  const goalsQuery = useGoals();
  const apply = useApplyRecovery();
  const [drafts, setDrafts] = useState<Record<string, RecoveryDraft>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<ApplyRecoveryResponse | null>(null);
  const [carried, setCarried] = useState<ApplyCarryOverResponse | null>(null);
  const [nothingToApply, setNothingToApply] = useState(false);
  // AI 정리 코치: a recommendation only pre-fills one Day's choice; the existing preview and apply do the rest.
  const [coach] = useState(() =>
    createRecoveryCoachFlow({ requestRecommendations: (body) => expectData(getDayFlowApiClient().POST("/api/v1/ai/coach/recovery", { body })) }),
  );
  const coachState = useSyncExternalStore(coach.subscribe, coach.getState, coach.getState);
  const [carryDates, setCarryDates] = useState<Record<string, string>>({});

  const periodGoalsQuery = usePeriodGoals();
  // Both kinds: a PERIOD Goal bounds MOVE the same way a WEEK Goal does.
  const goalsById = new Map<string, GoalResponse>([...(goalsQuery.data ?? []), ...(periodGoalsQuery.data ?? [])].map((goal) => [goal.id, goal]));
  const candidates = candidatesQuery.data ?? [];
  const missed = candidates.map((candidate) => candidate.day);
  const goalOf = (day: DayResponse) => (day.goalId === null ? undefined : goalsById.get(day.goalId));
  const rangeOf = (day: DayResponse) => moveRange(goalOf(day), today);
  const draftOf = (day: DayResponse) => drafts[day.id] ?? initialDraft(day, rangeOf(day)?.min ?? null);
  const currentDrafts = Object.fromEntries(missed.map((day) => [day.id, draftOf(day)]));
  const batch = batchDays(missed, currentDrafts);
  const skipped = skippedDays(missed, currentDrafts);
  const hasProblem = batch.some((day) => draftProblem(day, draftOf(day), rangeOf(day)) !== null);
  const update = (day: DayResponse, change: Partial<RecoveryDraft>) => setDrafts((current) => ({ ...current, [day.id]: { ...draftOf(day), ...change } }));
  const chooseRecommendation = (day: DayResponse, recommendation: RecoveryRecommendation) => {
    const draft = draftFromRecommendation(recommendation, draftOf(day));
    setDrafts((current) => ({ ...current, [day.id]: draft }));
    if (recommendation.action === "CARRY_OVER" && recommendation.targetDate) {
      setCarryDates((current) => ({ ...current, [day.id]: recommendation.targetDate as string }));
    }
    return draft;
  };
  /** The existing preview for one Day only: other Days are neither changed nor recorded. */
  const previewOne = (day: DayResponse, recommendation: RecoveryRecommendation) => {
    const draft = chooseRecommendation(day, recommendation);
    apply.reset();
    setApplied(null);
    setCarried(null);
    setNothingToApply(false);
    setPreview({ days: [day], drafts: { [day.id]: draft } });
  };

  if (preview) {
    const lines = previewLines(preview.days, preview.drafts);
    const previewBatch = batchDays(preview.days, preview.drafts);
    const previewSkipped = skippedDays(preview.days, preview.drafts);
    const confirm = () => {
      if (previewBatch.length === 0) {
        setNothingToApply(true);
        return;
      }
      apply.mutate(toApplyRequest(today, preview.days, preview.drafts), {
        onSuccess: (response) => {
          setApplied(response);
          setPreview(null);
          setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([, draft]) => draft.action === "CARRY_OVER" || draft.action === SKIP_THIS_TIME)));
        },
        onError: (error) => {
          if (isStaleDataError(error)) setPreview(null);
        },
      });
    };
    return (
      <Card>
        <SectionHeader title="이번 계획을 다시 정리할까요?" subtitle="확인을 누르기 전까지는 아무것도 바뀌지 않아요." />
        {apply.error ? <ErrorState error={apply.error} /> : null}
        {lines.map((line) => (
          <View key={line.dayId} style={{ gap: 2, paddingVertical: 4 }}>
            <View style={layout.spaceBetween}>
              <Text style={[text.strong, layout.flex]}>{line.title}</Text>
              <Badge label={RECOVERY_ACTION_LABEL[line.action]} soft color={palette.text} />
            </View>
            <Text style={text.muted}>{line.detail}</Text>
          </View>
        ))}
        {previewBatch.length - lines.length > 0 ? <Text style={text.muted}>그대로 두는 Day {previewBatch.length - lines.length}개는 바뀌지 않고, 정리했다는 기록만 남아요.</Text> : null}
        {previewSkipped.map((day) => (
          <View key={day.id} style={{ gap: 2, paddingVertical: 4, opacity: 0.7 }}>
            <View style={layout.spaceBetween}>
              <Text style={[text.strong, layout.flex]}>{day.title}</Text>
              <Badge label={SKIP_THIS_TIME_LABEL} soft color={palette.textSecondary} />
            </View>
            <Text style={text.muted}>변경 없음 · 기록하지 않고 다음에 다시 보여드려요</Text>
          </View>
        ))}
        {nothingToApply ? <Notice>적용할 변경이 없어요. 모두 이번엔 건너뛰기로 두었어요.</Notice> : null}
        <Button label={apply.isPending ? "적용 중…" : "확인하고 적용"} disabled={apply.isPending} onPress={confirm} />
        <Button label="돌아가서 고치기" variant="secondary" disabled={apply.isPending} onPress={() => setPreview(null)} />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader title="놓친 계획 정리" subtitle="지난 날짜의 계획과, 오늘 시간이 지난 계획" />
      {applied ? (
        <Notice tone="success" action={<Button label="Today로" small variant="secondary" onPress={() => openScreen("today")} />}>
          다시 정리했어요. Day {applied.days.length}개에 반영했어요.
        </Notice>
      ) : null}
      {carried ? (
        <Notice tone="success">
          다음 계획으로 이어갔어요. 새 Day {carried.days.length}개{carried.createdGoals.length > 0 ? `, 새 목표 ${carried.createdGoals.length}개` : ""}를 만들었어요.
        </Notice>
      ) : null}
      {candidatesQuery.isPending || goalsQuery.isPending || periodGoalsQuery.isPending ? (
        <LoadingState />
      ) : candidatesQuery.isError ? (
        <ErrorState error={candidatesQuery.error} onRetry={() => void candidatesQuery.refetch()} />
      ) : missed.length === 0 ? (
        <EmptyState>지금 다시 정리할 계획이 없어요.</EmptyState>
      ) : (
        <>
          <RecoveryCoachPanel flow={coach} state={coachState} today={today} />
          {candidates.map((candidate) => (
            <MissedDayCard
              key={candidate.day.id}
              candidate={candidate}
              today={today}
              goal={goalOf(candidate.day)}
              draft={draftOf(candidate.day)}
              range={rangeOf(candidate.day)}
              recommendation={(() => {
                const recommendation = recommendationFor(coachState.result, candidate.day.id);
                return recommendation && recommendationUsable(recommendation, candidate.day, goalOf(candidate.day), rangeOf(candidate.day), today)
                  ? recommendation
                  : null;
              })()}
              carryOverDate={carryDates[candidate.day.id]}
              onUseRecommendation={(recommendation) => chooseRecommendation(candidate.day, recommendation)}
              onPreviewRecommendation={(recommendation) => previewOne(candidate.day, recommendation)}
              onChange={(change) => update(candidate.day, change)}
              onCarried={(result) => {
                setApplied(null);
                setCarried(result);
                setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== candidate.day.id)));
              }}
            />
          ))}
          <Text style={text.muted}>
            {hasProblem
              ? "입력을 확인해주세요."
              : [`정리할 Day ${batch.length}개`, skipped.length > 0 ? `이번엔 건너뛰는 Day ${skipped.length}개` : null].filter(Boolean).join(" · ")}
          </Text>
          <Button
            label="변경 미리보기"
            disabled={hasProblem || batch.length + skipped.length === 0}
            onPress={() => {
              apply.reset();
              setApplied(null);
              setCarried(null);
              setNothingToApply(false);
              setPreview({ days: missed.filter((day) => currentDrafts[day.id]?.action !== "CARRY_OVER"), drafts: currentDrafts });
            }}
          />
        </>
      )}
    </Card>
  );
}

function MissedDayCard({
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
  const text = useTextStyles();
  const palette = usePalette();
  const { day } = candidate;
  const problem = draftProblem(day, draft, range);
  const periodGoal = goal?.kind === "PERIOD";
  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: palette.border }}>
      <View style={layout.rowWrap}>
        <Text style={text.strong}>{day.title}</Text>
        {day.coreDay ? <Badge label="핵심" /> : null}
        {day.priority !== "NONE" ? <Badge label={DAY_PRIORITY_LABEL[day.priority]} soft color={palette.text} /> : null}
      </View>
      <Text style={text.muted}>
        {describeDaySchedule(day)} · {day.estimatedMinutes}분 · {goal ? goalChipLabel(goal) : "목표 없음"} · {DAY_STATUS_LABEL[day.status]}
      </Text>
      <Text style={text.muted}>
        {REASON_LABEL[candidate.reason]}
        {candidate.lastAction ? ` · 전에 '${RECOVERY_ACTION_LABEL[candidate.lastAction]}'로 정리했지만 계획이 바뀌었어요` : ""}
      </Text>
      {recommendation ? (
        <View style={{ gap: spacing.xs, padding: spacing.sm, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: palette.accent }}>
          <Text style={text.accent}>
            AI 추천 · {RECOVERY_ACTION_LABEL[recommendation.action]}
            {recommendation.targetDate ? ` · ${koreanShortDate(recommendation.targetDate)}` : ""}
          </Text>
          <Text style={text.muted}>{recommendation.reason}</Text>
          <View style={layout.rowWrap}>
            <Button label="추천대로 선택" small variant="ghost" onPress={() => onUseRecommendation(recommendation)} />
            {recommendation.action !== "CARRY_OVER" ? <Button label="이 Day만 미리보기" small onPress={() => onPreviewRecommendation(recommendation)} /> : null}
          </View>
          {recommendation.action === "CARRY_OVER" && draft.action === "CARRY_OVER" ? <Text style={text.muted}>아래 이어가기 미리보기에서 확인한 뒤 적용해요.</Text> : null}
        </View>
      ) : null}
      <View style={layout.rowWrap}>
        {RECOVERY_ACTIONS.map((action) => {
          const reason = actionUnavailableReason(action, day, range, goal);
          return <Chip key={action} label={RECOVERY_ACTION_LABEL[action]} selected={draft.action === action} disabled={reason !== null} onPress={() => onChange({ action })} />;
        })}
        <Chip label={SKIP_THIS_TIME_LABEL} selected={draft.action === SKIP_THIS_TIME} onPress={() => onChange({ action: SKIP_THIS_TIME })} />
      </View>
      {range === null && periodGoal ? <Text style={text.muted}>기간 목표가 끝났어요. 다른 날에 다시 하려면 Day에서 목표 연결을 해제한 뒤 날짜를 바꿔주세요.</Text> : null}
      {range === null && !periodGoal ? <Text style={text.muted}>주간 목표 기간이 지나 날짜만 바꿀 수는 없어요. 다른 주에 하려면 &apos;다음 계획으로 이어가기&apos;를 골라주세요.</Text> : null}
      {periodGoal ? <Text style={text.muted}>{PERIOD_CARRY_OVER_BLOCKED}</Text> : null}
      {day.goalId === null ? <Text style={text.muted}>목표 없는 Day는 &apos;날짜 바꾸기&apos;로 오늘 이후 원하는 날에 옮길 수 있어요.</Text> : null}

      {draft.action === "KEEP" ? <Text style={text.muted}>날짜와 내용을 바꾸지 않아요. 계획이 바뀌기 전까지 다시 묻지 않아요.</Text> : null}
      {draft.action === SKIP_THIS_TIME ? <Text style={text.muted}>이번 정리에서는 빼둘게요. 아무것도 바꾸거나 기록하지 않고, 다음에 다시 보여드려요.</Text> : null}
      {draft.action === "DROP" ? <Text style={text.muted}>상태를 &apos;건너뜀&apos;으로 바꿔요. 삭제하지 않으니 Review에서 기록을 다시 볼 수 있어요.</Text> : null}
      {draft.action === "REDUCE" ? (
        <>
          <TextField
            label={`예상 시간(분) · 지금 ${day.estimatedMinutes}분`}
            keyboardType="number-pad"
            value={Number.isNaN(draft.estimatedMinutes) ? "" : String(draft.estimatedMinutes)}
            onChangeText={(text) => onChange({ estimatedMinutes: text === "" ? Number.NaN : Number(text) })}
          />
          <TextField label="제목 (작게 바꿔도 좋아요)" value={draft.title} maxLength={200} onChangeText={(title) => onChange({ title })} />
        </>
      ) : null}
      {draft.action === "MOVE" && range ? (
        <DateField
          label={
            range.max
              ? periodGoal
                ? "기간 목표 안의 새 날짜 (시간 배치는 해제돼요)"
                : "이번 주 안의 새 날짜 (시간 배치는 해제돼요)"
              : "오늘 이후의 새 날짜 (시간 배치는 해제돼요)"
          }
          value={draft.plannedDate}
          fallback={range.min}
          min={range.min}
          max={range.max}
          onChange={(plannedDate) => onChange({ plannedDate })}
        />
      ) : null}
      {draft.action === "CARRY_OVER" && goal && !periodGoal ? (
        <CarryOverPanel key={carryOverDate ?? "default"} day={day} weekGoal={goal} today={today} initialTargetDate={carryOverDate} onCarried={onCarried} />
      ) : null}
      {problem ? <Text style={text.danger}>{DRAFT_PROBLEM_MESSAGE[problem]}</Text> : null}
    </View>
  );
}

/** REC-003/004: pick a date and a way to continue; the server previews the Goal hierarchy as vertical steps. */
/** RecoveryCoach "AI 정리 코치": asked only on tap; recommendations appear on each Day card. */
function RecoveryCoachPanel({ flow, state, today }: { flow: RecoveryCoachFlow; state: RecoveryCoachState; today: string }) {
  const text = useTextStyles();
  const palette = usePalette();
  const ask = () => void flow.request({ localDate: today, timezone: deviceTimeZone() });
  const result = state.result;
  return (
    <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceMuted }}>
      <View style={layout.spaceBetween}>
        <Text style={text.strong}>AI 정리 코치</Text>
        {state.status === "success" ? <Button label="다시 받기" small variant="ghost" onPress={ask} /> : null}
      </View>
      {state.status === "idle" ? (
        <>
          <Text style={text.muted}>남은 Day와 최근 정리 기록을 보고 현실적인 선택을 제안해드려요.</Text>
          <Button label="AI 정리 제안 받기" small onPress={ask} />
        </>
      ) : null}
      {state.status === "loading" ? (
        <View style={layout.row} accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.accent} />
          <Text style={text.muted}>남은 Day를 살펴보고 있어요...</Text>
        </View>
      ) : null}
      {state.status === "error" && state.error ? (
        <>
          <Text style={text.danger}>{RECOVERY_COACH_ERROR_COPY[state.error]}</Text>
          {state.error !== "unavailable" ? <Button label="다시 시도" small variant="secondary" onPress={ask} /> : null}
        </>
      ) : null}
      {state.status === "success" && result ? (
        <>
          <Text style={text.strong}>{result.headline}</Text>
          {result.summary ? <Text style={text.body}>{result.summary}</Text> : null}
          {result.observations.map((observation, index) => (
            <Text key={index} style={text.muted}>
              · {observation.message}
            </Text>
          ))}
          <Text style={text.muted}>추천 {result.recommendations.length}개 · 적용 전 미리보기를 꼭 거쳐요.</Text>
        </>
      ) : null}
    </View>
  );
}

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
  initialTargetDate?: string;
  onCarried: (result: ApplyCarryOverResponse) => void;
}) {
  const text = useTextStyles();
  const palette = usePalette();
  const [targetDate, setTargetDate] = useState(initialTargetDate ?? defaultCarryOverDate(weekGoal, today));
  const [mode, setMode] = useState<CarryOverMode>("DAY_ONLY");
  const [weekGoalId, setWeekGoalId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<CarryOverLevel["type"], LevelChoice>>>({});
  const [extraDayIds, setExtraDayIds] = useState<string[]>([]);
  const apply = useApplyCarryOver();
  const dateProblem = carryOverDateProblem(targetDate, today, weekGoal);
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
  const preview: CarryOverPreviewResponse | undefined = body ? previewQuery.data : undefined;
  const reset = () => {
    apply.reset();
    setWeekGoalId(null);
    setOverrides({});
    setExtraDayIds([]);
  };

  return (
    <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: palette.surfaceMuted }}>
      <DateField
        label="새 계획 날짜"
        value={targetDate}
        fallback={today}
        min={today}
        onChange={(value) => {
          reset();
          setTargetDate(value);
        }}
      />
      <FieldLabel>이어가는 방식</FieldLabel>
      <ChipRow>
        {CARRY_OVER_MODES.map((value) => (
          <Chip
            key={value}
            label={CARRY_OVER_MODE_LABEL[value]}
            selected={mode === value}
            onPress={() => {
              reset();
              setMode(value);
            }}
          />
        ))}
      </ChipRow>
      {dateProblem ? <Text style={text.danger}>{dateProblem}</Text> : null}
      {body && previewQuery.isError && !preview ? <ErrorState error={previewQuery.error} onRetry={() => void previewQuery.refetch()} /> : null}
      {body && previewQuery.isPending ? <LoadingState label="새 계획을 계산하는 중…" /> : null}

      {preview ? (
        <View style={{ gap: spacing.sm }}>
          <Step label="원래 계획" value={preview.sourceGoalPath.map((goal) => goalChipLabel(goal)).join("\n")} />
          <Step label="새 계획 날짜" value={koreanShortDate(preview.targetDate)} />

          {preview.mode === "DAY_ONLY" ? (
            preview.targetWeekGoals.length === 0 ? (
              <Notice>이 날짜에 이어갈 주간 목표가 없어요. &apos;계획 구조와 함께 이어가기&apos;나 &apos;Goal 연결 없이 넘기기&apos;를 골라주세요.</Notice>
            ) : (
              <>
                <FieldLabel>이어갈 주간 목표</FieldLabel>
                <View style={layout.rowWrap}>
                  {preview.targetWeekGoals.map((goal) => (
                    <Chip key={goal.id} label={goalChipLabel(goal)} selected={preview.targetWeekGoalId === goal.id} onPress={() => setWeekGoalId(goal.id)} />
                  ))}
                </View>
              </>
            )
          ) : null}

          {preview.mode === "WITH_PLAN"
            ? preview.levels.map((level, index) => (
                <View key={level.type} style={{ gap: 4, paddingLeft: index * 10, borderLeftWidth: 2, borderLeftColor: palette.accent2, marginLeft: 4 }}>
                  <Text style={text.muted}>
                    {index + 1}. {GOAL_TYPE_LABEL[level.type]} · {goalPeriodLabel(level, true)}
                  </Text>
                  {level.action === "KEEP_SOURCE" ? (
                    <Text style={text.body}>그대로 사용 · {level.goal?.title}</Text>
                  ) : level.candidates.length === 0 ? (
                    <Text style={text.body}>새로 만들기 · {level.newTitle}</Text>
                  ) : (
                    <View style={layout.rowWrap}>
                      {level.candidates.map((goal) => (
                        <Chip
                          key={goal.id}
                          label={`기존 · ${goal.title}`}
                          selected={(overrides[level.type] ?? (level.action === "REUSE" ? level.goal?.id : undefined)) === goal.id}
                          onPress={() => setOverrides((current) => ({ ...current, [level.type]: goal.id }))}
                        />
                      ))}
                      <Chip
                        label={`새로 만들기 · ${level.sourceGoal?.title ?? level.newTitle ?? ""}`}
                        selected={(overrides[level.type] ?? (level.action === "CREATE" ? "new" : undefined)) === "new"}
                        onPress={() => setOverrides((current) => ({ ...current, [level.type]: "new" }))}
                      />
                    </View>
                  )}
                </View>
              ))
            : null}

          {preview.mode === "WITH_PLAN" && preview.days.length > 1 ? (
            <>
              <FieldLabel>함께 가져갈 미완료 항목</FieldLabel>
              <View style={layout.rowWrap}>
                {preview.days.map((entry) => (
                  <Chip
                    key={entry.day.id}
                    label={`${entry.day.title}${entry.exclusion === "FINISHED" ? " · 완료됨" : entry.exclusion === "ALREADY_CARRIED" ? " · 이미 이어감" : ""}`}
                    selected={entry.selected}
                    disabled={!entry.selectable || entry.day.id === day.id}
                    onPress={() => setExtraDayIds((current) => (current.includes(entry.day.id) ? current.filter((id) => id !== entry.day.id) : [...current, entry.day.id]))}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Notice>
            {preview.mode === "WITHOUT_GOAL"
              ? `목표 없이 ${koreanShortDate(preview.targetDate)}에 새 Day를 만들어요.`
              : `새 Day ${preview.days.filter((entry) => entry.selected).length}개를 ${koreanShortDate(preview.targetDate)}에 만들어요.`}
            {preview.mode === "WITH_PLAN" && preview.levels.some((level) => level.action === "CREATE")
              ? ` 새 목표(${preview.levels.filter((level) => level.action === "CREATE").map((level) => GOAL_TYPE_LABEL[level.type]).join(", ")})도 함께 만들어요.`
              : ""}{" "}
            원래 Day는 기록으로 남아요.
          </Notice>
          {apply.error ? <ErrorState error={apply.error} /> : null}
          <Button
            label={apply.isPending ? "적용 중…" : "확인하고 적용"}
            disabled={!preview.ready || apply.isPending || previewQuery.isFetching}
            onPress={() => apply.mutate(toApplyCarryOverRequest(today, preview), { onSuccess: onCarried })}
          />
        </View>
      ) : null}
    </View>
  );
}

function Step({ label, value }: { label: string; value: string }) {
  const text = useTextStyles();
  return (
    <View style={{ gap: 2 }}>
      <Text style={text.muted}>{label}</Text>
      <Text style={text.body}>{value}</Text>
    </View>
  );
}

function RecoveryDayManager({ today }: { today: string }) {
  const text = useTextStyles();
  const recoveryQuery = useRecoveryDays(addDays(today, -90), addDays(today, 365));
  const release = useDeleteRecoveryDay();
  const [editing, setEditing] = useState<{ date: string; existing: RecoveryDayResponse | null } | null>(null);
  const groups = groupRecoveryDays(recoveryQuery.data ?? [], today);

  const row = (day: RecoveryDayResponse) => (
    <View key={day.id} style={[layout.spaceBetween, { paddingVertical: 6 }]}>
      <View style={layout.flex}>
        <Text style={text.strong}>{koreanShortDate(day.date)}</Text>
        <Text style={text.muted}>
          {day.returnDate ? `${koreanShortDate(day.returnDate)}에 평소 계획으로 돌아와요` : "돌아올 날은 아직 정하지 않았어요"}
          {day.note ? ` · ${day.note}` : ""}
        </Text>
      </View>
      <Button label="수정" small variant="ghost" onPress={() => setEditing({ date: day.date, existing: day })} />
      <Button label="해제" small variant="secondary" disabled={release.isPending} onPress={() => release.mutate(day.date)} />
    </View>
  );

  return (
    <Card>
      <SectionHeader title="Recovery Day 관리" subtitle="쉬어갈 날을 미리 정하고, 핵심 Day를 0~1개로 줄여요" />
      {release.error ? <ErrorState error={release.error} /> : null}
      {recoveryQuery.isPending ? (
        <LoadingState />
      ) : recoveryQuery.isError ? (
        <ErrorState error={recoveryQuery.error} onRetry={() => void recoveryQuery.refetch()} />
      ) : (
        <>
          {groups.today.length > 0 ? <Notice tone="success">오늘은 Recovery Day예요. 천천히 회복해요.</Notice> : null}
          <Text style={text.muted}>예정 {groups.upcoming.length}개 · 지난 90일 {groups.past.length}개</Text>
          {[...groups.today, ...groups.upcoming].map(row)}
          {groups.past.length > 0 ? <FieldLabel>지난 Recovery Day</FieldLabel> : null}
          {groups.past.slice(0, 5).map(row)}
        </>
      )}
      {editing ? (
        <RecoveryDayForm key={`${editing.date}:${editing.existing?.version ?? "new"}`} today={today} initialDate={editing.date} existing={editing.existing} onDone={() => setEditing(null)} />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {groups.today.length === 0 ? <Button label="오늘을 Recovery Day로" onPress={() => setEditing({ date: today, existing: null })} /> : null}
          <Button label="다른 날짜를 Recovery Day로" variant="secondary" onPress={() => setEditing({ date: addDays(today, 1), existing: null })} />
        </View>
      )}
    </Card>
  );
}

const NO_CORE = "none";

function RecoveryDayForm({ today, initialDate, existing, onDone }: { today: string; initialDate: string; existing: RecoveryDayResponse | null; onDone: () => void }) {
  const text = useTextStyles();
  const palette = usePalette();
  const [date, setDate] = useState(initialDate);
  const [returnDate, setReturnDate] = useState(existing ? (existing.returnDate ?? "") : addDays(initialDate, 1));
  const [note, setNote] = useState(existing?.note ?? "");
  const [keepCoreId, setKeepCoreId] = useState<string | null>(null);
  const daysQuery = useDays({ from: date, to: date });
  const existingForDate = useRecoveryDays(date, date);
  const save = useSaveRecoveryDay();
  const coreDays = (daysQuery.data ?? []).filter((day) => day.coreDay && isOpenDay(day));
  const keep = keepCoreId ?? coreDays[0]?.id ?? NO_CORE;
  const current = existing ?? existingForDate.data?.[0] ?? null;
  const invalidReturn = returnDate !== "" && returnDate <= date;

  return (
    <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: palette.surfaceMuted }}>
      {save.error ? <ErrorState error={save.error} /> : null}
      {existing ? (
        <Text style={text.strong}>{koreanShortDate(date)}</Text>
      ) : (
        <DateField
          label="Recovery Day"
          value={date}
          fallback={today}
          min={today}
          onChange={(value) => {
            setDate(value);
            setKeepCoreId(null);
            if (returnDate !== "" && returnDate <= value) setReturnDate(addDays(value, 1));
          }}
        />
      )}
      <DateField label="돌아올 날 (선택)" value={returnDate} fallback={addDays(date, 1)} min={addDays(date, 1)} onChange={setReturnDate} onClear={() => setReturnDate("")} />
      <TextField label="메모 (선택)" value={note} maxLength={500} placeholder="예: 여행 후 회복" onChangeText={setNote} />
      {invalidReturn ? <Text style={text.danger}>돌아올 날은 Recovery Day 다음 날부터 고를 수 있어요.</Text> : null}
      {coreDays.length > 0 ? (
        <>
          <FieldLabel>이날 남길 핵심 Day (지금 {coreDays.length}개)</FieldLabel>
          <View style={layout.rowWrap}>
            {coreDays.map((day) => (
              <Chip key={day.id} label={`${day.title}만 남기기`} selected={keep === day.id} onPress={() => setKeepCoreId(day.id)} />
            ))}
            <Chip label="핵심 Day 없이 쉬어가기" selected={keep === NO_CORE} onPress={() => setKeepCoreId(NO_CORE)} />
          </View>
          <Text style={text.muted}>나머지는 핵심 표시만 해제되고 Day는 그대로 남아요.</Text>
        </>
      ) : (
        <Text style={text.muted}>이날 남아 있는 핵심 Day가 없어요.</Text>
      )}
      <Button
        label={save.isPending ? "저장 중…" : current ? "Recovery Day 저장" : `${koreanShortDate(date)}을 Recovery Day로`}
        disabled={save.isPending || date === "" || invalidReturn || daysQuery.isPending}
        onPress={() =>
          save.mutate(
            {
              date,
              body: {
                returnDate: returnDate === "" ? null : returnDate,
                note: note.trim(),
                expectedVersion: current?.version ?? null,
                releaseCoreDays: coreDays.filter((day) => day.id !== keep).map((day) => ({ id: day.id, version: day.version })),
              },
            },
            { onSuccess: onDone },
          )
        }
      />
      <Button label="취소" variant="ghost" disabled={save.isPending} onPress={onDone} />
    </View>
  );
}

function RecoveryHistory() {
  const text = useTextStyles();
  const palette = usePalette();
  const eventsQuery = useRecoveryEvents(30);
  return (
    <Card>
      <SectionHeader title="지난 정리 기록" subtitle="기록은 바뀌지 않아요" />
      {eventsQuery.isPending ? (
        <LoadingState />
      ) : eventsQuery.isError ? (
        <ErrorState error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()} />
      ) : eventsQuery.data.length === 0 ? (
        <EmptyState>아직 정리한 기록이 없어요.</EmptyState>
      ) : (
        eventsQuery.data.map((event) => (
          <View key={event.id} style={{ gap: 4, paddingVertical: 6 }}>
            <FieldLabel>{koreanShortDate(event.localDate)}에 정리</FieldLabel>
            {event.items.map((item) => (
              <View key={item.id} style={{ gap: 2 }}>
                <View style={layout.spaceBetween}>
                  <Text style={[text.strong, layout.flex]}>{item.dayTitle ?? "삭제된 Day"}</Text>
                  <Badge label={RECOVERY_ACTION_LABEL[item.action]} soft color={palette.text} />
                </View>
                <Text style={text.muted}>{historyDetail(item)}</Text>
              </View>
            ))}
          </View>
        ))
      )}
    </Card>
  );
}