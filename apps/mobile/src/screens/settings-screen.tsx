import { useRouter } from "expo-router";
import { Platform, Text, View } from "react-native";
import { TAB_META } from "@/features/navigation/tab-navigation";
import { useOpenScreen } from "@/features/navigation/use-open-screen";
import { PERMISSION_STATE_LABEL } from "@/features/notifications/permission-state";
import { useNotificationPermission } from "@/features/notifications/use-notification-permission";
import {
  THEME_MODES,
  THEME_MODE_LABEL,
  WEEK_STARTS,
  WEEK_START_LABEL,
  type TabScreen,
} from "@/features/settings/settings-model";
import { useSettings } from "@/features/settings/settings-provider";
import { apiConfig } from "@/lib/api-client";
import { Card, FieldLabel, ListRow, Notice, Screen, SectionHeader, Segmented, layout, useTextStyles } from "@/ui/components";

const SHORTCUTS: readonly TabScreen[] = ["goals", "review", "recovery", "days", "events", "calendar", "today"];

export default function SettingsScreen() {
  const text = useTextStyles();
  const router = useRouter();
  const openScreen = useOpenScreen();
  const { settings, update } = useSettings();
  const { snapshot } = useNotificationPermission();

  return (
    <Screen>
      <Card>
        <SectionHeader title="화면" />
        <ListRow onPress={() => router.push("/settings/tabs")} accessibilityLabel="하단 탭 설정">
          <View style={layout.flex}>
            <Text style={text.body}>하단 탭 설정</Text>
            <Text style={text.muted}>{settings.bottomTabs.map((screen) => TAB_META[screen].title).join(" · ")} · Settings</Text>
          </View>
          <Text style={text.muted}>›</Text>
        </ListRow>
        <FieldLabel>화면 모드</FieldLabel>
        <Segmented
          label="화면 모드"
          options={THEME_MODES.map((mode) => ({ value: mode, label: THEME_MODE_LABEL[mode] }))}
          value={settings.themeMode}
          onChange={(themeMode) => update({ themeMode })}
        />
      </Card>

      <Card>
        <SectionHeader title="캘린더" />
        <FieldLabel>한 주 시작 요일</FieldLabel>
        <Segmented
          label="한 주 시작 요일"
          options={WEEK_STARTS.map((start) => ({ value: start, label: WEEK_START_LABEL[start] }))}
          value={settings.calendarWeekStart}
          onChange={(calendarWeekStart) => update({ calendarWeekStart })}
        />
        <Text style={text.muted}>
          Calendar의 주간 날짜 순서에만 적용돼요. 주간 목표(WEEK Goal)와 주간 회고는 항상 월요일에 시작하는 기존 기간을 그대로 써요.
        </Text>
      </Card>

      <Card>
        <SectionHeader title="알림" />
        <ListRow onPress={() => router.push("/settings/notifications")} accessibilityLabel="알림 설정">
          <View style={layout.flex}>
            <Text style={text.body}>일정 알림</Text>
            <Text style={text.muted}>권한 · {snapshot ? PERMISSION_STATE_LABEL[snapshot.state] : "확인 중"}</Text>
          </View>
          <Text style={text.muted}>›</Text>
        </ListRow>
        {__DEV__ ? (
          <ListRow onPress={() => router.push("/dev/notifications")} accessibilityLabel="알림 디버그">
            <View style={layout.flex}>
              <Text style={text.body}>알림 예약 상태 (개발 빌드)</Text>
              <Text style={text.muted}>{apiConfig.ok ? `API ${apiConfig.baseUrl}` : "API 미설정"}</Text>
            </View>
            <Text style={text.muted}>›</Text>
          </ListRow>
        ) : null}
        {__DEV__ && Platform.OS === "android" ? (
          <ListRow onPress={() => router.push("/dev/focus")} accessibilityLabel="Focus 차단 POC">
            <View style={layout.flex}>
              <Text style={text.body}>Focus 앱 차단 POC (Android 개발 빌드)</Text>
              <Text style={text.muted}>접근성 서비스 · 차단 package · 5분 Focus</Text>
            </View>
            <Text style={text.muted}>›</Text>
          </ListRow>
        ) : null}
        {__DEV__ && apiConfig.ok && apiConfig.loopback ? <Notice tone="warning">API 주소가 localhost예요. 실제 기기에서는 컴퓨터의 LAN IP로 바꿔야 연결돼요.</Notice> : null}
      </Card>

      <Card>
        <SectionHeader title="기능 바로가기" />
        {SHORTCUTS.map((screen) => (
          <ListRow key={screen} onPress={() => openScreen(screen)} accessibilityLabel={TAB_META[screen].title}>
            <Text style={[text.title, { width: 28 }]}>{TAB_META[screen].glyph}</Text>
            <View style={layout.flex}>
              <Text style={text.body}>{TAB_META[screen].title}</Text>
              <Text style={text.muted}>{TAB_META[screen].subtitle}</Text>
            </View>
            <Text style={text.muted}>›</Text>
          </ListRow>
        ))}
      </Card>
    </Screen>
  );
}