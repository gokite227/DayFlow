import type { GoalResponse, ReviewItemResponse, ReviewResponse } from "@dayflow/api-client";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useDays } from "@/features/days/day-queries";
import { GOAL_TYPE_LABEL, formatRate, goalChipLabel, summarizeDays, summarizeGoal } from "@/features/goals/goal-helpers";
import { useGoals } from "@/features/goals/goal-queries";
import { useRecoveryCandidates } from "@/features/recovery/recovery-queries";
import {
  KPT_SECTIONS,
  REVIEW_GOAL_TYPE,
  REVIEW_TYPES,
  REVIEW_TYPE_LABEL,
  addItemChange,
  linkItemChange,
  nextGoalCandidates,
  removeItemChange,
  reviewGoalCandidates,
  reviewPeriod,
  saveReviewRequest,
  shiftAnchor,
  type ReviewChange,
  type ReviewItemKind,
  type ReviewPeriod,
  type ReviewType,
} from "@/features/review/review-helpers";
import { useReview, useSaveReview } from "@/features/review/review-queries";
import { koreanShortDate } from "@/lib/dates";
import { useOpenScreen } from "@/features/navigation/use-open-screen";
import { useToday } from "@/lib/use-today";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, ErrorState, layout, LoadingState, Notice, ProgressBar, Screen, SectionHeader, useTextStyles } from "@/ui/components";
import { fontSize, makeStyles, radius, spacing, TOUCH_TARGET, usePalette } from "@/ui/theme";

export default function ReviewScreen() {
  const text = useTextStyles();
  const today = useToday();
  const [type, setType] = useState<ReviewType>("WEEK");
  const [anchor, setAnchor] = useState(today);
  const period = reviewPeriod(type, anchor);

  return (
    <Screen>
      <ChipRow>
        {REVIEW_TYPES.map((value) => (
          <Chip key={value} label={REVIEW_TYPE_LABEL[value]} selected={value === type} onPress={() => setType(value)} />
        ))}
      </ChipRow>
      <View style={layout.spaceBetween}>
        <Button label="‹" variant="secondary" small accessibilityLabel="이전 기간" onPress={() => setAnchor(shiftAnchor(type, anchor, -1))} />
        <Text style={[text.title, { flex: 1, textAlign: "center" }]}>
          {REVIEW_TYPE_LABEL[type]} 회고 · {period.label}
        </Text>
        <Button label="›" variant="secondary" small accessibilityLabel="다음 기간" onPress={() => setAnchor(shiftAnchor(type, anchor, 1))} />
      </View>
      {/* Remount per period so drafts never leak between periods. */}
      <ReviewPeriodContent key={`${period.type}:${period.start}`} period={period} today={today} />
    </Screen>
  );
}

function ReviewPeriodContent({ period, today }: { period: ReviewPeriod; today: string }) {
  const text = useTextStyles();
  const styles = useStyles();
  const openScreen = useOpenScreen();
  const goalsQuery = useGoals();
  const daysQuery = useDays({ from: period.start, to: period.end });
  const allDaysQuery = useDays();
  const reviewQuery = useReview(period.type, period.start);
  const candidatesQuery = useRecoveryCandidates(today);

  const goals = goalsQuery.data ?? [];
  const days = daysQuery.data ?? [];
  const summary = summarizeDays(days);
  const periodGoals = reviewGoalCandidates(goals, period);
  const missed = (candidatesQuery.data ?? []).filter(({ day }) => day.plannedDate !== null && period.start <= day.plannedDate && day.plannedDate <= period.end).length;

  return (
    <>
      <Card>
        <SectionHeader title="기간 요약" subtitle="날짜가 정해진 Day 기준" />
        {daysQuery.isPending ? (
          <LoadingState />
        ) : daysQuery.isError ? (
          <ErrorState error={daysQuery.error} onRetry={() => void daysQuery.refetch()} />
        ) : (
          <View style={styles.metrics}>
            <Metric value={formatRate(summary.completionRate)} label="완료율" />
            <Metric value={String(summary.done)} label="완료" />
            <Metric value={String(summary.open)} label="미완료" />
            <Metric value={`${summary.coreDone}/${summary.coreTotal}`} label="핵심 완료" />
          </View>
        )}
        {missed > 0 ? (
          <Notice tone="warning" action={<Button label="다시 정리하기" small variant="secondary" onPress={() => openScreen("recovery")} />}>
            이 기간의 지난 계획 {missed}개를 다시 정리할 수 있어요.
          </Notice>
        ) : null}
      </Card>

      <Card>
        <SectionHeader title="Goals" subtitle={`이 기간의 ${GOAL_TYPE_LABEL[REVIEW_GOAL_TYPE[period.type]]} 목표`} />
        {goalsQuery.isPending ? (
          <LoadingState />
        ) : periodGoals.length === 0 ? (
          <EmptyState>이 기간의 목표가 없어요.</EmptyState>
        ) : (
          periodGoals.map((goal) => {
            const goalSummary = summarizeGoal(goals, days, goal.id);
            return (
              <View key={goal.id} style={{ gap: 4, paddingVertical: 4 }}>
                <View style={layout.spaceBetween}>
                  <Text style={[text.strong, layout.flex]} numberOfLines={2}>
                    {goal.title}
                  </Text>
                  <Text style={text.strong}>{formatRate(goalSummary.completionRate)}</Text>
                </View>
                <Text style={text.muted}>
                  기간 내 Day 완료 {goalSummary.done}/{goalSummary.total - goalSummary.skipped}
                </Text>
                <ProgressBar rate={goalSummary.completionRate} />
              </View>
            );
          })
        )}
      </Card>

      {reviewQuery.isPending ? (
        <LoadingState label="회고를 불러오는 중…" />
      ) : reviewQuery.isError ? (
        <ErrorState error={reviewQuery.error} onRetry={() => void reviewQuery.refetch()} />
      ) : (
        <KptEditor
          period={period}
          review={reviewQuery.data}
          goalsById={new Map(goals.map((goal) => [goal.id, goal]))}
          sourceCandidates={periodGoals}
          nextCandidates={nextGoalCandidates(goals, period)}
          convertedDayTitle={(dayId) => {
            const day = allDaysQuery.data?.find((candidate) => candidate.id === dayId);
            return day ? `${day.plannedDate ? `${koreanShortDate(day.plannedDate)} · ` : "날짜 미정 · "}${day.title}` : null;
          }}
        />
      )}
    </>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  const text = useTextStyles();
  const styles = useStyles();
  return (
    <View style={styles.metric}>
      <Text style={text.title}>{value}</Text>
      <Text style={text.muted}>{label}</Text>
    </View>
  );
}

function KptEditor({
  period,
  review,
  goalsById,
  sourceCandidates,
  nextCandidates,
  convertedDayTitle,
}: {
  period: ReviewPeriod;
  review: ReviewResponse | null;
  goalsById: Map<string, GoalResponse>;
  sourceCandidates: GoalResponse[];
  nextCandidates: GoalResponse[];
  convertedDayTitle: (dayId: string) => string | null;
}) {
  const text = useTextStyles();
  const palette = usePalette();
  const styles = useStyles();
  const router = useRouter();
  const save = useSaveReview(period.type, period.start);
  const [drafts, setDrafts] = useState<Record<ReviewItemKind, string>>({ KEEP: "", PROBLEM: "", TRY: "" });
  const [draftGoals, setDraftGoals] = useState<Record<ReviewItemKind, string | null>>({ KEEP: null, PROBLEM: null, TRY: null });
  const [picking, setPicking] = useState<{ itemId: string; mode: "goal" | "next" } | null>(null);
  const persist = (change: ReviewChange, onSaved?: () => void) => save.mutate(saveReviewRequest(review, change), { onSuccess: onSaved });
  const items = review?.items ?? [];
  const rating = review?.rating ?? null;
  const completed = review?.completed ?? false;

  const addItem = (kind: ReviewItemKind) => {
    if (drafts[kind].trim() === "") return;
    persist(addItemChange(review, kind, drafts[kind], draftGoals[kind]), () => {
      setDrafts((current) => ({ ...current, [kind]: "" }));
      setDraftGoals((current) => ({ ...current, [kind]: null }));
    });
  };

  return (
    <>
      {save.error ? <ErrorState error={save.error} /> : null}
      {KPT_SECTIONS.map(({ kind, title, hint, placeholder }) => (
        <Card key={kind}>
          <SectionHeader title={title} subtitle={hint} />
          {items.filter((item) => item.kind === kind).length === 0 ? <Text style={text.muted}>아직 작성한 내용이 없어요.</Text> : null}
          {items
            .filter((item) => item.kind === kind)
            .map((item) => (
              <KptItem
                key={item.id}
                item={item}
                review={review!}
                goalsById={goalsById}
                pending={save.isPending}
                picking={picking?.itemId === item.id ? picking.mode : null}
                onPick={(mode) => setPicking(mode === null ? null : { itemId: item.id, mode })}
                sourceCandidates={sourceCandidates}
                nextCandidates={nextCandidates}
                convertedDayTitle={convertedDayTitle}
                onChange={(change) => persist(change, () => setPicking(null))}
                onConvert={() => router.push({ pathname: "/review/try-to-day", params: { itemId: item.id, type: period.type, periodStart: period.start } })}
              />
            ))}
          <TextInput
            accessibilityLabel={`${title} 추가`}
            placeholder={placeholder}
            placeholderTextColor={palette.textSecondary}
            value={drafts[kind]}
            maxLength={1000}
            multiline
            editable={!save.isPending}
            onChangeText={(text) => setDrafts((current) => ({ ...current, [kind]: text }))}
            style={styles.input}
          />
          {sourceCandidates.length > 0 ? (
            <ChipRow>
              <Chip label="목표 연결 안 함" selected={draftGoals[kind] === null} onPress={() => setDraftGoals((current) => ({ ...current, [kind]: null }))} />
              {sourceCandidates.map((goal) => (
                <Chip key={goal.id} label={goalChipLabel(goal)} selected={draftGoals[kind] === goal.id} onPress={() => setDraftGoals((current) => ({ ...current, [kind]: goal.id }))} />
              ))}
            </ChipRow>
          ) : null}
          <Button label="+ 추가" small disabled={save.isPending || drafts[kind].trim() === ""} onPress={() => addItem(kind)} />
        </Card>
      ))}

      <Card>
        <SectionHeader title="회고 마무리" subtitle="완료해도 언제든 다시 수정할 수 있어요" />
        <Text style={text.muted}>이번 기간 만족도</Text>
        <View style={layout.row}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: rating === value }}
              accessibilityLabel={`만족도 ${value}`}
              disabled={save.isPending}
              onPress={() => persist({ rating: rating === value ? null : value })}
              style={[styles.rating, rating === value && styles.ratingActive]}
            >
              <Text style={[text.strong, rating === value && { color: palette.onAccent }]}>{value}</Text>
            </Pressable>
          ))}
        </View>
        <Button label={completed ? "회고 다시 열기" : "회고 완료"} variant={completed ? "secondary" : "primary"} disabled={save.isPending} onPress={() => persist({ completed: !completed })} />
        {completed ? <Badge label="✓ 작성 완료" color={palette.success} /> : null}
        <Text style={text.muted}>{save.isPending ? "저장 중…" : "입력하는 즉시 저장돼요."}</Text>
      </Card>
    </>
  );
}

function KptItem({
  item,
  review,
  goalsById,
  pending,
  picking,
  onPick,
  sourceCandidates,
  nextCandidates,
  convertedDayTitle,
  onChange,
  onConvert,
}: {
  item: ReviewItemResponse;
  review: ReviewResponse;
  goalsById: Map<string, GoalResponse>;
  pending: boolean;
  picking: "goal" | "next" | null;
  onPick: (mode: "goal" | "next" | null) => void;
  sourceCandidates: GoalResponse[];
  nextCandidates: GoalResponse[];
  convertedDayTitle: (dayId: string) => string | null;
  onChange: (change: ReviewChange) => void;
  onConvert: () => void;
}) {
  const text = useTextStyles();
  const palette = usePalette();
  const styles = useStyles();
  const goal = item.goalId ? goalsById.get(item.goalId) : undefined;
  const target = item.targetGoalId ? goalsById.get(item.targetGoalId) : undefined;
  const options = picking === "goal" ? (goal && !sourceCandidates.includes(goal) ? [goal, ...sourceCandidates] : sourceCandidates) : nextCandidates;

  return (
    <View style={styles.item}>
      <Text style={text.body}>{item.content}</Text>
      {goal ? <Badge label={`🎯 ${goalChipLabel(goal)}`} soft color={palette.text} /> : null}
      {item.kind === "TRY" && item.convertedDayId ? (
        <Text style={[text.muted, { color: palette.success }]}>✓ Day로 추가됨{convertedDayTitle(item.convertedDayId) ? ` → ${convertedDayTitle(item.convertedDayId)}` : ""}</Text>
      ) : null}
      {item.kind === "TRY" && target ? <Text style={[text.muted, { color: palette.success }]}>✓ 다음 목표에 연결됨 → {goalChipLabel(target)}</Text> : null}
      <View style={layout.rowWrap}>
        <Button label={item.goalId ? "목표 변경" : "목표 연결"} variant="ghost" small disabled={pending} onPress={() => onPick(picking === "goal" ? null : "goal")} />
        {item.kind === "TRY" && !item.convertedDayId ? <Button label="Day로 만들기" variant="ghost" small disabled={pending} onPress={onConvert} /> : null}
        {item.kind === "TRY" ? (
          target ? (
            <Button label="다음 목표 연결 해제" variant="ghost" small disabled={pending} onPress={() => onChange(linkItemChange(review, item.id, { targetGoalId: null }))} />
          ) : (
            <Button label="다음 목표에 연결" variant="ghost" small disabled={pending} onPress={() => onPick(picking === "next" ? null : "next")} />
          )
        ) : null}
        <Button label="삭제" variant="danger" small disabled={pending} onPress={() => onChange(removeItemChange(review, item.id))} />
      </View>
      {picking ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={text.muted}>{picking === "goal" ? "연결할 목표" : "이어갈 다음 목표"}</Text>
          {options.length === 0 ? (
            <Text style={text.muted}>{picking === "goal" ? "이 기간에 연결할 목표가 없어요." : "연결할 다음 목표가 아직 없어요."}</Text>
          ) : (
            <View style={layout.rowWrap}>
              {options.map((option) => (
                <Chip
                  key={option.id}
                  label={goalChipLabel(option)}
                  selected={picking === "goal" && option.id === item.goalId}
                  disabled={pending}
                  onPress={() => onChange(linkItemChange(review, item.id, picking === "goal" ? { goalId: option.id } : { targetGoalId: option.id }))}
                />
              ))}
            </View>
          )}
          {picking === "goal" && goal ? <Button label="목표 연결 해제" variant="ghost" small disabled={pending} onPress={() => onChange(linkItemChange(review, item.id, { goalId: null }))} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((palette) => ({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metric: { flexGrow: 1, flexBasis: "45%", backgroundColor: palette.surfaceMuted, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  input: {
    minHeight: TOUCH_TARGET + 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: palette.surface,
    fontSize: fontSize.body,
    color: palette.text,
    textAlignVertical: "top",
  },
  item: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.border },
  rating: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  ratingActive: { backgroundColor: palette.accent, borderColor: palette.accent },
}));