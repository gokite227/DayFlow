import type { CoachEvidence, TodayCoachResponse } from "@dayflow/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { getDayFlowApiClient } from "@/lib/api-client";
import { describeError, expectData } from "@/lib/api-error";
import { deviceTimeZone } from "@/lib/dates";
import { queryKeys } from "@/lib/query-keys";
import { makeStyles, radius, spacing, usePalette } from "@/ui/theme";
import { Button, Card, layout, SectionHeader, useTextStyles } from "@/ui/components";
import {
  COACH_ERROR_COPY,
  createTodayCoachFlow,
  describeSuggestionChange,
  isApplicable,
  suggestionKey,
  type TodayCoachFlow,
  type TodayCoachState,
} from "./today-coach-flow";

const EVIDENCE_LABEL: Record<CoachEvidence["type"], string> = { DAY: "Day", GOAL: "목표", REVIEW: "회고", METRIC: "수치" };

function confirmAlert(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert("제안 적용", message, [
      { text: "취소", style: "cancel", onPress: () => resolve(false) },
      { text: "적용", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/**
 * "오늘의 코치" (compact): asks the AI Coach only on tap. The answer stays in memory; a suggestion changes a Day only
 * after [적용] and the confirmation alert, through the normal Day PATCH.
 */
export function TodayCoachCard({ today }: { today: string }) {
  const text = useTextStyles();
  const palette = usePalette();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [flow] = useState<TodayCoachFlow>(() =>
    createTodayCoachFlow({
      requestCoach: (body) => expectData(getDayFlowApiClient().POST("/api/v1/ai/coach/today", { body })),
      loadDay: (dayId) => expectData(getDayFlowApiClient().GET("/api/v1/days/{dayId}", { params: { path: { dayId } } })),
      // The same PATCH as the Day editor; Days are refetched afterwards (also after a 409 or a rule error).
      patchDay: async (dayId, body) => {
        try {
          return await expectData(getDayFlowApiClient().PATCH("/api/v1/days/{dayId}", { params: { path: { dayId } }, body }));
        } finally {
          void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
        }
      },
      confirm: confirmAlert,
    }),
  );
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  const ask = () => void flow.request(today, deviceTimeZone());
  const openDay = (dayId: string) => router.push({ pathname: "/days/edit", params: { dayId } });

  return (
    <Card>
      <SectionHeader
        title="오늘의 코치"
        action={state.status === "success" ? <Button label="다시 받기" small variant="ghost" onPress={ask} /> : undefined}
      />

      {state.status === "idle" ? (
        <View style={layout.stack}>
          <Text style={text.muted}>오늘 계획을 보고 우선순위를 정리해드릴게요.</Text>
          <Button label="오늘 코치 받기" onPress={ask} />
        </View>
      ) : null}

      {state.status === "loading" ? (
        <View style={layout.row} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.accent} />
          <Text style={text.muted}>오늘 계획을 살펴보고 있어요...</Text>
        </View>
      ) : null}

      {state.status === "error" && state.error ? (
        <View style={layout.stack} accessibilityLiveRegion="polite">
          <Text style={text.danger}>{COACH_ERROR_COPY[state.error]}</Text>
          {state.error !== "unavailable" ? <Button label="다시 시도" small variant="secondary" onPress={ask} /> : null}
        </View>
      ) : null}

      {state.status === "success" && state.result ? (
        <CoachResult result={state.result} state={state} flow={flow} onOpenDay={openDay} />
      ) : null}

      <Text style={text.muted}>DayFlow의 계획 데이터를 바탕으로 제안해요. 제안은 자동으로 적용되지 않아요.</Text>
    </Card>
  );
}

function CoachResult({
  result,
  state,
  flow,
  onOpenDay,
}: {
  result: TodayCoachResponse;
  state: TodayCoachState;
  flow: TodayCoachFlow;
  onOpenDay: (dayId: string) => void;
}) {
  const text = useTextStyles();
  const styles = useStyles();
  const empty = result.priorities.length === 0 && result.observations.length === 0 && result.suggestions.length === 0;

  return (
    <View style={styles.result}>
      <View style={{ gap: 2 }}>
        <Text style={text.strong}>{result.headline}</Text>
        {result.summary ? <Text style={text.body}>{result.summary}</Text> : null}
      </View>

      {result.priorities.length > 0 ? (
        <View style={layout.stack}>
          <Text style={text.accent}>먼저 할 일</Text>
          {result.priorities.map((priority, index) => (
            <View key={priority.dayId} style={styles.item}>
              <Text
                style={text.strong}
                accessibilityRole="link"
                onPress={() => onOpenDay(priority.dayId)}
              >
                {index + 1}. {priority.dayTitle}
              </Text>
              <Text style={text.muted}>{priority.reason}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {result.observations.length > 0 ? (
        <View style={layout.stack}>
          <Text style={text.accent}>코치 메모</Text>
          {result.observations.map((observation, index) => (
            <View key={index} style={styles.item}>
              <Text style={text.body}>{observation.message}</Text>
              <View style={layout.rowWrap}>
                {observation.evidence.map((evidence) => (
                  <Text key={`${evidence.type}:${evidence.id}`} style={[text.muted, styles.chip]} numberOfLines={1}>
                    {EVIDENCE_LABEL[evidence.type]} · {evidence.label}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {result.suggestions.length > 0 ? (
        <View style={layout.stack}>
          <Text style={text.accent}>추천</Text>
          {result.suggestions.map((suggestion, index) => {
            const key = suggestionKey(suggestion, index);
            const change = describeSuggestionChange(suggestion);
            const applied = state.applied[key];
            const applyError = state.applyError?.key === key ? state.applyError : null;
            return (
              <View key={key} style={styles.item}>
                <Text style={text.body}>{suggestion.message}</Text>
                {suggestion.dayTitle ? (
                  <Text style={text.muted}>
                    {suggestion.dayTitle}
                    {change ? ` · ${change}` : ""}
                  </Text>
                ) : null}
                {suggestion.dayId ? (
                  <View style={layout.rowWrap}>
                    <Button label="Day 보기" small variant="ghost" onPress={() => onOpenDay(suggestion.dayId as string)} />
                    {isApplicable(suggestion) ? (
                      applied ? (
                        <Text style={text.accent}>{applied}</Text>
                      ) : (
                        <Button
                          label={state.applying === key ? "적용 중…" : "적용"}
                          small
                          disabled={state.applying !== null}
                          onPress={() => void flow.apply(suggestion, index)}
                        />
                      )
                    ) : null}
                  </View>
                ) : null}
                {applyError ? <Text style={text.danger}>{applyError.message ?? describeError(applyError.error)}</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {empty ? <Text style={text.muted}>지금은 제안할 만한 내용이 많지 않아요.</Text> : null}
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
