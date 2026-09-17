import type { ReviewEvidence, ReviewResponse, SaveReviewRequest } from "@dayflow/api-client";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { deviceTimeZone } from "@/lib/dates";
import { fontSize, makeStyles, radius, spacing, usePalette } from "@/ui/theme";
import { Button, Card, layout, SectionHeader, useTextStyles } from "@/ui/components";
import {
  REVIEW_COACH_ERROR_COPY,
  replacedCount,
  type ReviewCoachFlow,
  type ReviewCoachState,
  type ReviewItemKind,
} from "./review-coach-flow";
import type { ReviewPeriod } from "./review-helpers";

const SECTIONS: { key: "keep" | "problem" | "try"; title: string }[] = [
  { key: "keep", title: "좋았던 흐름" },
  { key: "problem", title: "아쉬웠던 흐름" },
  { key: "try", title: "다음에 시도할 것" },
];

/**
 * "AI 회고 초안" (compact): asks the Review Coach only on tap. [초안 적용] fills unsaved draft lines of the KPT
 * editor; nothing is saved until [초안 저장].
 */
export function ReviewCoachCard({
  flow,
  state,
  period,
  review,
  typing,
}: {
  flow: ReviewCoachFlow;
  state: ReviewCoachState;
  period: ReviewPeriod;
  review: ReviewResponse | null;
  typing: boolean;
}) {
  const text = useTextStyles();
  const palette = usePalette();
  const styles = useStyles();
  const ask = () => void flow.request({ type: period.type, periodStart: period.start, timezone: deviceTimeZone() });
  const result = state.result;
  const empty = result !== null && result.keep.length + result.problem.length + result.try.length === 0;

  return (
    <Card>
      <SectionHeader
        title="AI 회고 초안"
        action={state.status === "success" ? <Button label="다시 만들기" small variant="ghost" onPress={ask} /> : undefined}
      />

      {state.status === "idle" ? (
        <View style={layout.stack}>
          <Text style={text.muted}>이번 기간의 계획과 실행 기록을 바탕으로 KPT 초안을 만들어드려요.</Text>
          <Button label="AI 초안 만들기" onPress={ask} />
        </View>
      ) : null}

      {state.status === "loading" ? (
        <View style={layout.row} accessibilityRole="progressbar" accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.accent} />
          <Text style={text.muted}>이번 기간의 기록을 살펴보고 있어요...</Text>
        </View>
      ) : null}

      {state.status === "error" && state.error ? (
        <View style={layout.stack} accessibilityLiveRegion="polite">
          <Text style={text.danger}>{REVIEW_COACH_ERROR_COPY[state.error]}</Text>
          {state.error !== "unavailable" ? <Button label="다시 시도" small variant="secondary" onPress={ask} /> : null}
        </View>
      ) : null}

      {state.status === "success" && result ? (
        <View style={styles.result}>
          <View style={{ gap: 2 }}>
            <Text style={text.strong}>{result.headline}</Text>
            {result.summary ? <Text style={text.body}>{result.summary}</Text> : null}
          </View>
          {result.highlights.map((highlight, index) => (
            <View key={`h${index}`} style={styles.item}>
              <Text style={text.body}>{highlight.message}</Text>
              <Evidence evidence={highlight.evidence} shown={[highlight.message]} />
            </View>
          ))}
          {SECTIONS.map(({ key, title }) =>
            result[key].length === 0 ? null : (
              <View key={key} style={layout.stack}>
                <Text style={text.accent}>{title}</Text>
                {result[key].map((item, index) => (
                  <View key={index} style={styles.item}>
                    <Text style={text.body}>{item.text}</Text>
                    {item.reason ? <Text style={text.muted}>{item.reason}</Text> : null}
                  </View>
                ))}
              </View>
            ),
          )}
          {empty ? (
            <Text style={text.muted}>기록만으로 제안할 만한 KPT가 뚜렷하지 않아요.</Text>
          ) : state.conflict ? (
            <View style={[styles.item, styles.conflict]} accessibilityLiveRegion="polite">
              <Text style={text.strong}>이미 작성한 회고 내용이 있어요.</Text>
              <Text style={text.muted}>교체를 골라도 저장 전에는 아무것도 바뀌지 않아요. Day로 만든 항목과 목표에 연결된 항목은 그대로 남아요.</Text>
              <Button label="기존 내용 뒤에 추가" small onPress={() => flow.resolveConflict("append", review)} />
              <View style={layout.rowWrap}>
                <Button label="AI 초안으로 교체" small variant="ghost" onPress={() => flow.resolveConflict("replace", review)} />
                <Button label="취소" small variant="ghost" onPress={() => flow.resolveConflict("cancel", review)} />
              </View>
            </View>
          ) : (
            <Button label="초안 적용" small onPress={() => flow.applyDraft(review, typing)} />
          )}
        </View>
      ) : null}

      <Text style={text.muted}>계획과 실행 기록으로 만든 초안이에요. 적용해도 저장 전에는 아무것도 바뀌지 않아요.</Text>
    </Card>
  );
}

/** Facts behind a line; a fact the sentence already quotes is not repeated. */
function Evidence({ evidence, shown }: { evidence: ReviewEvidence[]; shown: string[] }) {
  const text = useTextStyles();
  const styles = useStyles();
  const chips = evidence.filter((item) => !shown.some((line) => line.includes(item.label)));
  return chips.length === 0 ? null : (
    <View style={layout.rowWrap}>
      {chips.map((item) => (
        <Text key={item.key} style={[text.muted, styles.chip]} numberOfLines={2}>
          {item.label}
        </Text>
      ))}
    </View>
  );
}

/** Unsaved AI draft lines of one KPT kind, editable before saving. */
export function ReviewDraftLines({ flow, state, kind, title }: { flow: ReviewCoachFlow; state: ReviewCoachState; kind: ReviewItemKind; title: string }) {
  const text = useTextStyles();
  const palette = usePalette();
  const styles = useStyles();
  const lines = state.drafts.filter((line) => line.kind === kind);
  return lines.length === 0 ? null : (
    <View style={layout.stack}>
      {lines.map((line, index) => (
        <View key={line.key} style={styles.draft}>
          <Text style={text.accent}>AI 초안 · 저장 전</Text>
          <TextInput
            accessibilityLabel={`${title} AI 초안 ${index + 1}`}
            value={line.content}
            maxLength={1000}
            multiline
            editable={!state.saving}
            placeholderTextColor={palette.textSecondary}
            onChangeText={(value) => flow.editDraft(line.key, value)}
            style={styles.input}
          />
          <Button label="빼기" small variant="ghost" disabled={state.saving} onPress={() => flow.removeDraft(line.key)} />
        </View>
      ))}
    </View>
  );
}

/** The only place the drafts are written: [초안 저장] uses the same review PUT as the editor. */
export function ReviewDraftBar({
  flow,
  state,
  review,
  save,
}: {
  flow: ReviewCoachFlow;
  state: ReviewCoachState;
  review: ReviewResponse | null;
  save: (body: SaveReviewRequest) => Promise<ReviewResponse>;
}) {
  const text = useTextStyles();
  if (state.drafts.length === 0 && state.replacingIds.length === 0) return null;
  const replacing = replacedCount(review, state.replacingIds);
  return (
    <Card>
      <Text style={text.strong}>저장하지 않은 AI 초안 {state.drafts.length}개</Text>
      <Text style={text.muted}>
        {replacing > 0
          ? `저장하면 기존 항목 ${replacing}개가 초안으로 바뀌어요. 저장 전에는 그대로예요.`
          : "수정한 뒤 [초안 저장]을 눌러야 회고에 저장돼요."}
      </Text>
      <View style={layout.rowWrap}>
        <Button label={state.saving ? "저장 중…" : "초안 저장"} small disabled={state.saving} onPress={() => void flow.saveDrafts(review, save)} />
        <Button label="초안 비우기" small variant="ghost" disabled={state.saving} onPress={() => flow.discardDrafts()} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((c) => ({
  result: { gap: spacing.md },
  item: { gap: 4, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceElevated },
  conflict: { backgroundColor: c.surfaceMuted, gap: spacing.sm },
  chip: { maxWidth: "100%", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden", backgroundColor: c.surfaceMuted },
  draft: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: c.accent },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: c.surface,
    fontSize: fontSize.body,
    color: c.text,
    textAlignVertical: "top",
  },
}));
