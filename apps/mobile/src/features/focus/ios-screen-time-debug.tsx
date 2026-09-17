import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState, Text } from "react-native";
import { screenTimeModule, type ScreenTimeStatus } from "../../../modules/dayflow-screen-time";
import { koreanTime } from "@/lib/dates";
import { Button, Card, EmptyState, Notice, Screen, useTextStyles } from "@/ui/components";
import { screenTimeSelectionLabel } from "./ios-screen-time";

const POC_MINUTES = 5;

const AUTHORIZATION_LABEL: Record<ScreenTimeStatus["authorization"], string> = {
  notDetermined: "미결정 (NOT_DETERMINED)",
  approved: "허용됨 (APPROVED)",
  denied: "거부됨 (DENIED)",
  unavailable: "사용 불가 (UNAVAILABLE)",
};

const clock = (epochMs: number) => {
  const date = new Date(epochMs);
  return `${koreanTime(date.getHours() * 60 + date.getMinutes())}:${String(date.getSeconds()).padStart(2, "0")}`;
};

/**
 * NATIVE DEBUG ONLY (development builds, iOS): verifies Screen Time on a real iPhone — authorization, Apple's app
 * picker, a 5-minute shield, stop, persistence after DayFlow is killed, and the automatic end. Calls the
 * dayflow-screen-time module directly; errors are shown as they come from iOS.
 */
export function IosScreenTimeDebugScreen() {
  const text = useTextStyles();
  const [status, setStatus] = useState<ScreenTimeStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!screenTimeModule) return;
    try {
      setStatus(screenTimeModule.getStatus());
    } catch (error) {
      setMessage(`getStatus 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") refresh();
      });
      return () => subscription.remove();
    }, [refresh]),
  );

  if (!screenTimeModule) {
    return (
      <Screen>
        <EmptyState>DayflowScreenTime native module이 없어요. iPhone용 development build(expo run:ios --device)에서만 쓸 수 있어요.</EmptyState>
      </Screen>
    );
  }
  const module = screenTimeModule;

  const run = async (label: string, action: () => Promise<string> | string) => {
    setBusy(true);
    try {
      setMessage(`${label}: ${await action()}`);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? ` [${String((error as { code: unknown }).code)}]` : "";
      setMessage(`${label} 실패${code}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <Screen>
      <Card>
        <Text style={text.strong}>Screen Time 권한</Text>
        <Text style={text.body}>{status ? AUTHORIZATION_LABEL[status.authorization] : "확인 중"}</Text>
        <Button
          label="권한 요청"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            void run("권한 요청", async () => {
              const result = await module.requestAuthorization();
              return result.error ? `${AUTHORIZATION_LABEL[result.authorization]} · iOS 오류: ${result.error}` : AUTHORIZATION_LABEL[result.authorization];
            })
          }
        />
      </Card>

      <Card>
        <Text style={text.strong}>선택</Text>
        <Text style={text.body}>{status ? screenTimeSelectionLabel(status) : "-"}</Text>
        <Button
          label="앱 선택"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            void run("앱 선택", async () => {
              const counts = await module.presentActivityPicker();
              return counts ? screenTimeSelectionLabel(counts) : "취소됨";
            })
          }
        />
        <Button label="선택 비우기" variant="ghost" small disabled={busy} onPress={() => void run("선택 비우기", () => screenTimeSelectionLabel(module.clearSelection()))} />
      </Card>

      <Card>
        <Text style={text.strong}>잠금</Text>
        <Button
          label={`${POC_MINUTES}분 잠금 시작`}
          disabled={busy}
          onPress={() =>
            void run(`${POC_MINUTES}분 잠금 시작`, () => {
              const next = module.startBlocking({ durationMinutes: POC_MINUTES, lockMode: "FLEXIBLE", origin: "MANUAL", shield: true });
              return next.active ? `ACTIVE · 자동 해제 예약: ${next.autoEnd ?? "-"}` : "시작되지 않음";
            })
          }
        />
        <Button label="잠금 종료" variant="danger" disabled={busy} onPress={() => void run("잠금 종료", () => (module.stopBlocking().active ? "여전히 ACTIVE" : "OFF"))} />
        {message ? <Notice>{message}</Notice> : null}
      </Card>

      <Card>
        <Text style={text.strong}>현재 상태 (native)</Text>
        <Text style={text.body}>세션: {status?.active ? "ACTIVE" : "OFF"}</Text>
        {status?.active && status.endsAt ? <Text style={text.body}>종료 예정: {clock(status.endsAt)}</Text> : null}
        {status?.active ? <Text style={text.muted}>잠금 방식: {status.lockMode} · 자동 해제 예약: {status.autoEnd ?? "-"}</Text> : null}
        <Text style={text.muted}>
          ManagedSettings shield: 앱 {status?.shieldedApplicationCount ?? 0}개 · 카테고리 {status?.shieldHasCategories ? "있음" : "없음"}
        </Text>
        <Button label="새로고침" variant="ghost" small onPress={refresh} />
      </Card>
    </Screen>
  );
}
