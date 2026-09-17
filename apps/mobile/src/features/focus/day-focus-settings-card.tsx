import type { DayResponse } from "@dayflow/api-client";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text } from "react-native";
import { Button, Card, Chip, ChipRow, FieldLabel, ListRow, useTextStyles } from "@/ui/components";
import { selectionSummary } from "./app-selection";
import { scheduleProblem } from "./focus-automation";
import { formatTimeRange } from "./focus-display";
import { FOCUS_LOCK_MODES, FOCUS_TRIGGER_MODES } from "./focus-model";
import {
  AUTO_STRICT_CONFIRMATION,
  DEFAULT_DAY_FOCUS_PREFERENCE,
  LOCK_MODE_LABEL,
  TRIGGER_MODE_LABEL,
  needsAutoStrictConfirmation,
  resolveDayFocus,
  type DayFocusPreference,
} from "./focus-preferences";
import { useFocus } from "./focus-provider";

/**
 * Day edit > 집중 설정 (collapsed by default, only for a Day with a schedule). Overrides the Focus settings for
 * this Day only; saved on this device right away, independent of the Day form's 저장.
 */
export function DayFocusSettingsCard({ day }: { day: DayResponse }) {
  const text = useTextStyles();
  const router = useRouter();
  const { dayPreferences, saveDayPreference, storedSettings, selection, adapter } = useFocus();
  const [open, setOpen] = useState(false);
  const [now] = useState(() => Date.now());
  if (!day.schedule) return null;

  const preference = dayPreferences[day.id] ?? DEFAULT_DAY_FOCUS_PREFERENCE;
  const resolved = resolveDayFocus(preference, storedSettings, selection.apps);
  const problem = scheduleProblem(day, now);
  const summary =
    resolved.triggerMode === "MANUAL"
      ? "자동화 사용 안 함"
      : `${TRIGGER_MODE_LABEL[resolved.triggerMode]}${resolved.triggerMode === "NOTIFY_ONLY" ? "" : ` · ${LOCK_MODE_LABEL[resolved.lockMode]}`}`;

  const change = (next: DayFocusPreference) => {
    const after = resolveDayFocus(next, storedSettings, selection.apps);
    if (!needsAutoStrictConfirmation(resolved, after)) {
      saveDayPreference(day.id, next);
      return;
    }
    Alert.alert("자동 시작 + 종료 시각까지 해제 불가", AUTO_STRICT_CONFIRMATION, [
      { text: "취소", style: "cancel" },
      { text: "이대로 저장", style: "destructive", onPress: () => saveDayPreference(day.id, next) },
    ]);
  };

  return (
    <Card>
      <ListRow onPress={() => setOpen((current) => !current)} accessibilityLabel={`집중 설정 ${open ? "접기" : "펼치기"}`}>
        <Text style={[text.strong, { flex: 1 }]}>
          집중 설정{"\n"}
          <Text style={text.muted}>
            {formatTimeRange(day.schedule.startAt, day.schedule.endAt)} · {preference === DEFAULT_DAY_FOCUS_PREFERENCE ? "기본 설정 사용 · " : ""}
            {summary}
          </Text>
        </Text>
        <Text style={[text.muted, { fontSize: 20 }]}>{open ? "⌄" : "›"}</Text>
      </ListRow>
      {open ? (
        <>
          {problem ? <Text style={text.muted}>{problem} 자동화는 적용되지 않아요.</Text> : null}
          <FieldLabel>집중 자동화</FieldLabel>
          <ChipRow>
            <Chip label="기본 설정 사용" selected={preference.triggerMode === "DEFAULT"} onPress={() => change({ ...preference, triggerMode: "DEFAULT" })} />
            {FOCUS_TRIGGER_MODES.filter((mode) => mode !== "MANUAL").map((mode) => (
              <Chip key={mode} label={TRIGGER_MODE_LABEL[mode]} selected={preference.triggerMode === mode} onPress={() => change({ ...preference, triggerMode: mode })} />
            ))}
            <Chip label="사용 안 함" selected={preference.triggerMode === "MANUAL"} onPress={() => change({ ...preference, triggerMode: "MANUAL" })} />
          </ChipRow>
          {resolved.triggerMode === "NOTIFY_ONLY" || resolved.triggerMode === "MANUAL" ? null : (
            <>
              <FieldLabel>잠금 방식</FieldLabel>
              <ChipRow>
                <Chip label="기본 설정 사용" selected={preference.lockMode === "DEFAULT"} onPress={() => change({ ...preference, lockMode: "DEFAULT" })} />
                {FOCUS_LOCK_MODES.map((mode) => (
                  <Chip key={mode} label={LOCK_MODE_LABEL[mode]} selected={preference.lockMode === mode} onPress={() => change({ ...preference, lockMode: mode })} />
                ))}
              </ChipRow>
              {adapter.available ? (
                <>
                  <FieldLabel>차단 앱</FieldLabel>
                  <ChipRow>
                    <Chip label="기본 목록 사용" selected={preference.apps === null} onPress={() => change({ ...preference, apps: null })} />
                    <Chip
                      label="이 Day만 별도 설정"
                      selected={preference.apps !== null}
                      onPress={() => {
                        if (preference.apps === null) change({ ...preference, apps: [...selection.apps] });
                      }}
                    />
                  </ChipRow>
                  <Text style={text.muted}>{selectionSummary(resolved.apps)}</Text>
                  {preference.apps !== null ? (
                    <Button label="이 Day의 차단 앱 변경" small variant="secondary" onPress={() => router.push({ pathname: "/focus/apps", params: { dayId: day.id } })} />
                  ) : null}
                </>
              ) : null}
            </>
          )}
          <Text style={text.muted}>이 설정은 이 기기에만 바로 저장돼요.</Text>
        </>
      ) : null}
    </Card>
  );
}
