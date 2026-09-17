import type { CoachFact, PlanningCoachResponse } from "@dayflow/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { getDayFlowApiClient } from "@/lib/api-client";
import { describeError, expectData } from "@/lib/api-error";
import { addDays, deviceTimeZone, koreanShortDate, startOfWeek } from "@/lib/dates";
import { queryKeys } from "@/lib/query-keys";
import { makeStyles, radius, spacing, usePalette } from "@/ui/theme";
import { Button, Card, layout, SectionHeader, Segmented, useTextStyles } from "@/ui/components";
import {
  PLANNING_COACH_ERROR_COPY,
  createPlanningCoachFlow,
  describeSuggestionChange,
  isApplicableSuggestion,
  planningWeekStarts,
  proposalKey,
  suggestionKey,
  type PlanningCoachFlow,
  type PlanningCoachState,
} from "./planning-coach-flow";

function confirmAlert(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert("제안 적용", message, [
      { text: "취소", style: "cancel", onPress: () => resolve(false) },
      { text: "적용", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

const mondayOf = (date: string) => startOfWeek(date, "monday");

/**
 * "AI 계획 코치" on a WEEK Goal (its canonical week) or a PERIOD Goal (a derived Mon–Sun week). Asked only on tap; each
 * suggestion is applied alone after the confirmation alert, through the normal Day APIs.
 */
export function PlanningCoachCard({
  goal,
  today,
  openDayCount,
}: {
  goal: { id: string; kind?: string; startDate: string; endDate: string };
  today: string;
  openDayCount: number;
}) {
  const text = useTextStyles();
  const palette = usePalette();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isPeriod = goal.kind === "PERIOD";
  const weeks = isPeriod ? planningWeekStarts(goal, today, mondayOf, addDays) : [];
  const [weekStart, setWeekStart] = useState<string>(weeks[0] ?? "");
  const [flow] = useState<PlanningCoachFlow>(() => {
    const client = getDayFlowApiClient;
    const refreshing = async <T,>(call: () => Promise<T>) => {
      try {
        return await call();
      } finally {
        void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
      }
    };
    return createPlanningCoachFlow({
      requestPlanning: (body) => expectData(client().POST("/api/v1/ai/coach/planning", { body })),
      loadDay: (dayId) => expectData(client().GET("/api/v1/days/{dayId}", { params: { path: { dayId } } })),
      patchDay: (dayId, body) =>
        refreshing(() => expectData(client().PATCH("/api/v1/days/{dayId}", { params: { path: { dayId } }, body }))),
      putSchedule: (dayId, body) =>
        refreshing(() => expectData(client().PUT("/api/v1/days/{dayId}/schedule", { params: { path: { dayId } }, body }))),
      createDay: (body) => refreshing(() => expectData(client().POST("/api/v1/days", { body }))),
      confirm: confirmAlert,
      timeZone: deviceTimeZone,
    });
  });
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);

  // An ended period has nothing left to plan (the server answers 400 as well).
  if (goal.endDate < today || (isPeriod && weeks.length === 0)) return null;

  const ask = () =>
    void flow.request({ goalId: goal.id, weekStart: isPeriod && weekStart ? weekStart : null, timezone: deviceTimeZone() });
  const openDay = (dayId: string) => router.push({ pathname: "/days/edit", params: { dayId } });

  return (
    <Card>
      <SectionHeader
        title="AI 계획 코치"
        action={state.status === "success" ? <Button label="다시 받기" small variant="ghost" onPress={ask} /> : undefined}
      />

      {isPeriod && weeks.length > 1 && state.status !== "loading" ? (
        <Segmented
          label="점검할 주"
          value={weekStart}
          onChange={setWeekStart}
          options={weeks.map((monday) => ({ value: monday, label: monday <= today ? "이번 주" : "다음 주" }))}
        />
      ) : null}

      {state.status === "idle" || state.status === "error" ? (
        <View style={layout.stack}>
          <Text style={text.muted}>최근 회고와 다음 기간 계획을 함께 보고 현실적인 배치를 제안해드려요.</Text>
          {state.status === "idle" ? (
            <Button label={openDayCount < 2 ? "AI 계획 초안 받기" : "AI로 계획 점검하기"} onPress={ask} />
          ) : null}
        </View>
      ) : null}

      {state.status === "loading" ? (
        <View style={layout.row} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.accent} />
          <Text style={text.muted}>계획과 최근 기록을 살펴보고 있어요...</Text>
        </View>
      ) : null}

      {state.status === "error" && state.error ? (
        <View style={layout.stack} accessibilityLiveRegion="polite">
          <Text style={text.danger}>{PLANNING_COACH_ERROR_COPY[state.error]}</Text>
          {state.error !== "unavailable" ? <Button label="다시 시도" small variant="secondary" onPress={ask} /> : null}
        </View>
      ) : null}

      {state.status === "success" && state.result ? (
        <PlanningResult result={state.result} state={state} flow={flow} onOpenDay={openDay} />
      ) : null}

      <Text style={text.muted}>제안은 자동으로 적용되지 않아요. 하나씩 확인한 뒤 적용할 수 있어요.</Text>
    </Card>
  );
}

function FactChips({ facts }: { facts: CoachFact[] }) {
  const text = useTextStyles();
  const styles = useStyles();
  if (facts.length === 0) return null;
  return (
    <View style={layout.rowWrap}>
      {facts.map((fact) => (
        <Text key={fact.key} style={[text.muted, styles.chip]} numberOfLines={1}>
          {fact.label}
        </Text>
      ))}
    </View>
  );
}

function PlanningResult({
  result,
  state,
  flow,
  onOpenDay,
}: {
  result: PlanningCoachResponse;
  state: PlanningCoachState;
  flow: PlanningCoachFlow;
  onOpenDay: (dayId: string) => void;
}) {
  const text = useTextStyles();
  const styles = useStyles();
  const empty = result.observations.length === 0 && result.suggestions.length === 0 && result.proposals.length === 0;

  return (
    <View style={styles.result}>
      <View style={{ gap: 2 }}>
        <Text style={text.strong}>{result.headline}</Text>
        <Text style={text.muted}>
          {koreanShortDate(result.targetStart)} ~ {koreanShortDate(result.targetEnd)}
        </Text>
        {result.summary ? <Text style={text.body}>{result.summary}</Text> : null}
      </View>

      {result.observations.length > 0 ? (
        <View style={layout.stack}>
          <Text style={text.accent}>살펴본 점</Text>
          {result.observations.map((observation, index) => (
            <View key={index} style={styles.item}>
              <Text style={text.body}>{observation.message}</Text>
              <FactChips facts={observation.evidence} />
            </View>
          ))}
        </View>
      ) : null}

      {result.suggestions.length > 0 ? (
        <View style={layout.stack}>
          <Text style={text.accent}>기존 Day 제안</Text>
          {result.suggestions.map((suggestion, index) => {
            const key = suggestionKey(suggestion, index);
            const applied = state.applied[key];
            const applyError = state.applyError?.key === key ? state.applyError : null;
            return (
              <View key={key} style={styles.item}>
                <Text style={text.strong}>{suggestion.dayTitle}</Text>
                <Text style={text.muted}>{describeSuggestionChange(suggestion)}</Text>
                <Text style={text.body}>{suggestion.reason}</Text>
                <FactChips facts={suggestion.evidence} />
                <View style={layout.rowWrap}>
                  <Button label="Day 보기" small variant="ghost" onPress={() => onOpenDay(suggestion.dayId)} />
                  {isApplicableSuggestion(suggestion) ? (
                    applied ? (
                      <Text style={text.accent}>{applied}</Text>
                    ) : (
                      <Button
                        label={state.applying === key ? "적용 중…" : "적용"}
                        small
                        disabled={state.applying !== null}
                        onPress={() => void flow.applySuggestion(suggestion, index)}
                      />
                    )
                  ) : null}
                </View>
                {applyError ? <Text style={text.danger}>{applyError.message ?? describeError(applyError.error)}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {result.proposals.length > 0 ? (
        <View style={layout.stack}>
          <Text style={text.accent}>새 Day 제안</Text>
          {result.proposals.map((proposal, index) => {
            const key = proposalKey(index);
            const applied = state.applied[key];
            const applyError = state.applyError?.key === key ? state.applyError : null;
            return (
              <View key={key} style={styles.item}>
                <Text style={text.strong}>{proposal.title}</Text>
                <Text style={text.muted}>{proposal.proposedDate ? koreanShortDate(proposal.proposedDate) : "날짜 미정"}</Text>
                <Text style={text.body}>{proposal.reason}</Text>
                <FactChips facts={proposal.evidence} />
                {applied ? (
                  <Text style={text.accent}>{applied}</Text>
                ) : (
                  <Button
                    label={state.applying === key ? "만드는 중…" : "Day 만들기"}
                    small
                    disabled={state.applying !== null}
                    onPress={() => void flow.createProposal(proposal, index)}
                  />
                )}
                {applyError ? <Text style={text.danger}>{applyError.message ?? describeError(applyError.error)}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {empty ? <Text style={text.muted}>지금 계획에서 바꿀 만한 점을 찾지 못했어요.</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  result: { gap: spacing.md },
  item: {
    gap: 4,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceElevated,
  },
  chip: {
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: c.surfaceMuted,
  },
}));
