import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { selectionSummary } from "@/features/focus/app-selection";
import { AUTOMATION_WINDOW_DAYS } from "@/features/focus/focus-automation";
import { FOCUS_LOCK_MODES, type FocusLockMode, type FocusTriggerMode } from "@/features/focus/focus-model";
import {
  AUTO_STRICT_CONFIRMATION,
  LOCK_MODE_HINT,
  LOCK_MODE_LABEL,
  TRIGGER_MODE_HINT,
  TRIGGER_MODE_LABEL,
  needsAutoStrictConfirmation,
  type FocusSettings,
} from "@/features/focus/focus-preferences";
import { useFocus } from "@/features/focus/focus-provider";
import { PERMISSION_STATE_LABEL, permissionAction } from "@/features/notifications/permission-state";
import { useNotificationPermission } from "@/features/notifications/use-notification-permission";
import { Button, Card, Notice, RadioRow, Screen, SectionHeader, useTextStyles } from "@/ui/components";

/** "사용 안 함" is last: the recommended default (ASK) comes first. */
const TRIGGER_OPTIONS: readonly FocusTriggerMode[] = ["ASK", "NOTIFY_ONLY", "AUTO", "MANUAL"];

/** Settings > Focus: the defaults for Day schedule automation (device-local). */
export default function FocusSettingsScreen() {
  const text = useTextStyles();
  const router = useRouter();
  const { settings, saveSettings, selection, adapter, state } = useFocus();
  const { snapshot, request, openSettings } = useNotificationPermission();
  const [timing, setTiming] = useState(() => safeTiming(adapter));
  const strictRunning = state.current?.status === "ACTIVE" && state.current.lockMode === "STRICT";

  useFocusEffect(
    useCallback(() => {
      setTiming(safeTiming(adapter));
    }, [adapter]),
  );

  const change = (next: FocusSettings) => {
    if (!needsAutoStrictConfirmation(settings, next)) {
      saveSettings(next);
      return;
    }
    Alert.alert("자동 시작 + 종료 시각까지 해제 불가", AUTO_STRICT_CONFIRMATION, [
      { text: "취소", style: "cancel" },
      { text: "이대로 저장", style: "destructive", onPress: () => saveSettings(next) },
    ]);
  };

  const automated = settings.triggerMode !== "MANUAL";
  const notificationAction = snapshot ? permissionAction(snapshot) : "none";

  return (
    <Screen>
      {!adapter.scheduler.available ? (
        <Notice tone="warning">이 기기에서는 일정 시작 시 집중 자동화를 아직 쓸 수 없어요. 설정은 저장되고, 집중은 Focus 화면에서 직접 시작할 수 있어요.</Notice>
      ) : null}

      <Card>
        <SectionHeader title="일정 시작 시" subtitle="시간이 정해진 Day가 시작될 때" />
        {TRIGGER_OPTIONS.map((mode) => (
          <RadioRow
            key={mode}
            label={mode === "ASK" ? `${TRIGGER_MODE_LABEL[mode]} (권장)` : TRIGGER_MODE_LABEL[mode]}
            hint={TRIGGER_MODE_HINT[mode]}
            selected={settings.triggerMode === mode}
            onPress={() => change({ ...settings, triggerMode: mode })}
          />
        ))}
        <Text style={text.muted}>Day마다 Day 편집 화면의 &quot;집중 설정&quot;에서 따로 정할 수 있어요. 앞으로 {AUTOMATION_WINDOW_DAYS}일 안의 일정이 이 기기에 예약돼요.</Text>
      </Card>

      <Card>
        <SectionHeader title="잠금 방식" subtitle="자동으로 시작한 집중과 Focus 화면의 기본 선택" />
        {FOCUS_LOCK_MODES.map((mode: FocusLockMode) => (
          <RadioRow
            key={mode}
            label={LOCK_MODE_LABEL[mode]}
            hint={LOCK_MODE_HINT[mode]}
            selected={settings.lockMode === mode}
            disabled={strictRunning}
            onPress={() => change({ ...settings, lockMode: mode })}
          />
        ))}
        {strictRunning ? <Text style={text.muted}>강제 집중이 끝난 뒤 바꿀 수 있어요.</Text> : null}
      </Card>

      <Card>
        <SectionHeader
          title="기본 차단 앱"
          subtitle={adapter.available ? selectionSummary(selection.apps) : "이 기기에서는 앱 차단을 아직 쓸 수 없어요."}
          action={adapter.available ? <Button label="변경" small variant="secondary" disabled={strictRunning} onPress={() => router.push("/focus/apps")} /> : undefined}
        />
      </Card>

      {automated && adapter.scheduler.available ? (
        <Card>
          <SectionHeader title="알림과 시작 시각" />
          <Text style={text.body}>알림 권한 · {snapshot ? PERMISSION_STATE_LABEL[snapshot.state] : "확인 중"}</Text>
          {notificationAction !== "none" ? (
            <>
              <Text style={text.muted}>알림을 허용해야 일정 시작 알림과 &quot;집중을 시작할까요?&quot;를 받을 수 있어요. 자동 시작은 알림 없이도 동작해요.</Text>
              <Button
                label={notificationAction === "request" ? "알림 허용" : "설정에서 알림 허용"}
                small
                variant="secondary"
                onPress={() => void (notificationAction === "request" ? request() : openSettings())}
              />
            </>
          ) : null}
          {timing.userControlled ? (
            <>
              <Text style={text.body}>정확한 시각에 시작 · {timing.timing === "exact" ? "허용됨" : "꺼짐"}</Text>
              {timing.timing === "exact" ? null : (
                <>
                  <Text style={text.muted}>
                    Android의 &quot;알람 및 리마인더&quot;를 허용하지 않으면 배터리 절약을 위해 집중이 일정보다 몇 분 늦게 시작될 수 있어요. 허용은 선택이에요.
                  </Text>
                  <View>
                    <Button label="알람 및 리마인더 설정 열기" small variant="secondary" onPress={() => void adapter.scheduler.openTimingSettings()} />
                  </View>
                </>
              )}
            </>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

function safeTiming(adapter: ReturnType<typeof useFocus>["adapter"]) {
  try {
    return adapter.scheduler.timing();
  } catch {
    return { timing: "unsupported" as const, userControlled: false };
  }
}
