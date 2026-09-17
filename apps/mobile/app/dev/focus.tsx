import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState, Platform, Text } from "react-native";
import {
  getExactAlarmStatus,
  getFocusSchedules,
  getFocusStatus,
  getPermissionStatus,
  isFocusBlockingAvailable,
  openAccessibilitySettings,
  setBlockedPackages,
  startFocus,
  stopFocus,
  type FocusPermissionStatus,
  type FocusStatus,
  type NativeScheduleState,
} from "../../modules/dayflow-focus";
import { parsePackageInput } from "@/features/focus/package-input";
import { Button, Card, EmptyState, Notice, Screen, TextField, useTextStyles } from "@/ui/components";

const DEBUG_DURATION_MINUTES = 5;

/**
 * NATIVE DEBUG ONLY (development builds, Android): calls the dayflow-focus module directly, without Focus
 * sessions. The product screen is src/screens/focus-screen.tsx. A Focus started here shows up in the product
 * as a recovered session (no Day); stopping here cancels a running product Focus on its next reconcile.
 */
export default function FocusNativeDebugScreen() {
  const text = useTextStyles();
  const [permission, setPermission] = useState<FocusPermissionStatus | null>(null);
  const [status, setStatus] = useState<FocusStatus | null>(null);
  const [schedules, setSchedules] = useState<NativeScheduleState[]>([]);
  const [exactAlarm, setExactAlarm] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!isFocusBlockingAvailable) return;
    setPermission(getPermissionStatus());
    const next = getFocusStatus();
    setStatus(next);
    setSchedules(getFocusSchedules());
    setExactAlarm(getExactAlarmStatus().exact);
    setInput((current) => (current === "" ? next.blockedPackages.join("\n") : current));
  }, []);

  // Re-read when the screen gains focus and when returning from Android Accessibility settings.
  useFocusEffect(
    useCallback(() => {
      refresh();
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") refresh();
      });
      return () => subscription.remove();
    }, [refresh]),
  );

  const run = (action: () => FocusStatus | void, done: string) => {
    try {
      const next = action();
      if (next) setStatus(next);
      setMessage(done);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
    refresh();
  };

  if (!__DEV__ || Platform.OS !== "android" || !isFocusBlockingAvailable) {
    return (
      <Screen>
        <EmptyState>Android development build에서만 쓸 수 있어요.</EmptyState>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={text.strong}>접근성 권한</Text>
        <Text style={text.body}>
          서비스 켜짐: {permission?.accessibilityServiceEnabled ? "예" : "아니요"} · 연결됨: {permission?.serviceConnected ? "예" : "아니요"}
        </Text>
        <Button label="접근성 설정 열기" variant="secondary" onPress={() => run(openAccessibilitySettings, "접근성 설정을 열었어요.")} />
      </Card>

      <Card>
        <TextField
          label="차단할 packageName"
          hint="쉼표나 줄바꿈으로 구분 (예: com.instagram.android)"
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <Button
          label="차단 목록 저장"
          variant="secondary"
          onPress={() => {
            const parsed = parsePackageInput(input);
            if (parsed.invalid.length > 0) {
              setMessage(`올바르지 않은 packageName: ${parsed.invalid.join(", ")}`);
              return;
            }
            run(() => setBlockedPackages(parsed.packages), `차단 목록 ${parsed.packages.length}개를 저장했어요.`);
          }}
        />
        <Button label={`${DEBUG_DURATION_MINUTES}분 Focus 시작`} onPress={() => run(() => startFocus(DEBUG_DURATION_MINUTES), "Focus를 시작했어요.")} />
        <Button label="Focus 종료" variant="danger" onPress={() => run(stopFocus, "Focus를 종료했어요.")} />
        {message ? <Notice>{message}</Notice> : null}
      </Card>

      <Card>
        <Text style={text.strong}>현재 상태</Text>
        <Text style={text.body}>
          Focus: {status?.active ? `켜짐 · ${Math.ceil((status.remainingSeconds ?? 0) / 60)}분 남음` : "꺼짐"}
        </Text>
        <Text style={text.body}>차단 목록: {status && status.blockedPackages.length > 0 ? status.blockedPackages.join(", ") : "없음"}</Text>
        <Text style={text.body}>
          잠금: {status?.lockMode ?? "-"} · 시작: {status?.origin ?? "-"} · Day: {status?.dayTitle ?? "-"}
        </Text>
        <Text style={text.muted}>마지막 감지 앱: {status?.lastForegroundPackage ?? "-"}</Text>
        <Text style={text.muted}>마지막 차단 앱: {status?.lastBlockedPackage ?? "-"}</Text>
        <Button label="새로고침" variant="ghost" small onPress={refresh} />
      </Card>

      <Card>
        <Text style={text.strong}>일정 집중 예약 (native)</Text>
        <Text style={text.muted}>정확한 알람: {exactAlarm === null ? "-" : exactAlarm ? "허용됨" : "꺼짐 (inexact)"}</Text>
        {schedules.length === 0 ? <Text style={text.muted}>예약 없음</Text> : null}
        {schedules.map((entry) => (
          <Text key={entry.id} style={text.body}>
            {entry.title} · {new Date(entry.startAt).toLocaleString()}–{new Date(entry.endAt).toLocaleTimeString()} · {entry.trigger}/{entry.lockMode} · {entry.status} · 앱 {entry.packageNames.length}
          </Text>
        ))}
      </Card>
    </Screen>
  );
}
