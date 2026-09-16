import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { readFingerprints } from "@/features/notifications/notification-adapter";
import { PERMISSION_STATE_LABEL } from "@/features/notifications/permission-state";
import { getLastReconcileResult, reconcileEventReminders, subscribeReconcileResult } from "@/features/notifications/reconcile-service";
import { isEventReminderIdentifier } from "@/features/notifications/reminder-plan";
import { useNotificationPermission } from "@/features/notifications/use-notification-permission";
import { Button, Card, EmptyState, Screen, useTextStyles } from "@/ui/components";

interface PendingEntry {
  identifier: string;
  body: string;
  triggerAt: number | null;
}

async function loadPending(): Promise<PendingEntry[]> {
  const [requests, fingerprints] = await Promise.all([Notifications.getAllScheduledNotificationsAsync(), readFingerprints()]);
  return requests
    .filter((request) => isEventReminderIdentifier(request.identifier))
    .map((request) => {
      const trigger = Number(fingerprints[request.identifier]?.split("|")[0]);
      return { identifier: request.identifier, body: request.content.body ?? "", triggerAt: Number.isFinite(trigger) ? trigger : null };
    })
    .sort((a, b) => (a.triggerAt ?? Infinity) - (b.triggerAt ?? Infinity));
}

/** Development-only view of what is actually pending on this device. Not reachable in production builds. */
export default function NotificationDebugScreen() {
  const text = useTextStyles();
  const { snapshot } = useNotificationPermission();
  const result = useSyncExternalStore(subscribeReconcileResult, getLastReconcileResult, getLastReconcileResult);
  // Re-read whenever a reconcile finishes (its timestamp is part of the key).
  const pendingQuery = useQuery({
    queryKey: ["device", "pending-event-reminders", result?.at ?? 0],
    queryFn: loadPending,
    staleTime: 0,
  });
  const pending = pendingQuery.data ?? null;

  if (!__DEV__) {
    return (
      <Screen>
        <EmptyState>개발 빌드에서만 볼 수 있어요.</EmptyState>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={text.strong}>권한: {snapshot ? PERMISSION_STATE_LABEL[snapshot.state] : "확인 중"}</Text>
        <Text style={text.body}>예약된 DayFlow 일정 알림: {pending?.length ?? "…"}개</Text>
        {result ? (
          <Text style={text.muted}>
            마지막 reconcile {new Date(result.at).toLocaleString()} · {result.reason} · {result.status}
            {"\n"}계획 {result.planned} · 새 예약 {result.scheduled} · 취소 {result.cancelled} · 유지 {result.unchanged} · 실패 {result.failed}
            {result.error ? `\n오류: ${result.error}` : ""}
          </Text>
        ) : (
          <Text style={text.muted}>아직 reconcile 기록이 없어요.</Text>
        )}
        <Button label="지금 다시 맞추기" onPress={() => void reconcileEventReminders("manual")} />
      </Card>
      <Card>
        <Text style={text.strong}>다음 알림</Text>
        {pending === null ? null : pending.length === 0 ? (
          <EmptyState>예약된 알림이 없어요.</EmptyState>
        ) : (
          pending.slice(0, 10).map((entry) => (
            <View key={entry.identifier} style={{ gap: 2, paddingVertical: 6 }}>
              <Text style={text.body}>{entry.triggerAt ? new Date(entry.triggerAt).toLocaleString() : "시간 정보 없음"}</Text>
              <Text style={text.muted}>{entry.body}</Text>
              <Text style={[text.muted, { fontSize: 11 }]}>{entry.identifier}</Text>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}