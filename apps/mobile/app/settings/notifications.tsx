import { Text } from "react-native";
import { NotificationPermissionCard } from "@/components/notification-permission-card";
import { REMINDER_WINDOW_DAYS } from "@/features/notifications/reminder-plan";
import { Card, Screen, useTextStyles } from "@/ui/components";

export default function NotificationSettingsScreen() {
  const text = useTextStyles();
  return (
    <Screen>
      <NotificationPermissionCard />
      <Card>
        <Text style={text.strong}>알림이 예약되는 방식</Text>
        <Text style={text.muted}>
          일정 알림은 서버 푸시가 아니라 이 기기에 직접 예약돼요. 앱을 열 때마다 앞으로 {REMINDER_WINDOW_DAYS}일 안의 알림을 서버 일정과 다시 맞춰요. 반복 일정은 이
          범위 안의 알림만 미리 예약돼요.
        </Text>
      </Card>
    </Screen>
  );
}