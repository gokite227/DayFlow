import { Text } from "react-native";
import {
  PERMISSION_STATE_LABEL,
  permissionAction,
} from "@/features/notifications/permission-state";
import { useNotificationPermission } from "@/features/notifications/use-notification-permission";
import { Button, Card, SectionHeader, useTextStyles } from "@/ui/components";

/**
 * Explains Event reminders before the OS dialog appears; the dialog opens only when the user taps.
 * `compact` hides the card once notifications are allowed (used inline on Events and the Event form).
 */
export function NotificationPermissionCard({ compact = false }: { compact?: boolean }) {
  const text = useTextStyles();
  const { snapshot, request, openSettings } = useNotificationPermission();
  if (!snapshot) return null;
  const action = permissionAction(snapshot);
  if (compact && action === "none") return null;

  return (
    <Card>
      <SectionHeader title="일정 알림" subtitle={`알림 권한 · ${PERMISSION_STATE_LABEL[snapshot.state]}`} />
      {action === "none" ? (
        <Text style={text.muted}>일정에 설정한 알림(정각, 10분 전, 1일 전 등)을 이 기기에서 보내드려요. 인터넷이 없어도 예약된 알림은 울려요.</Text>
      ) : action === "request" ? (
        <>
          <Text style={text.body}>
            일정에 알림을 설정하면 이 기기에서 시간에 맞춰 알려드려요. 알림에는 일정 제목과 시간만 보여요. 계속하면 시스템 권한 창이 열려요.
          </Text>
          <Button label="알림 허용하기" onPress={() => void request()} />
        </>
      ) : (
        <>
          <Text style={text.body}>알림이 꺼져 있어서 일정 알림을 보낼 수 없어요. 설정 앱에서 DayFlow 알림을 켜주세요.</Text>
          <Button label="설정 열기" variant="secondary" onPress={() => void openSettings()} />
        </>
      )}
    </Card>
  );
}