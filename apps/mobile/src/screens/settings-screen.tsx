import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Platform, Text, View } from "react-native";
import { useAuthSession, useAuthState } from "@/features/auth/use-auth";
import { LOCK_MODE_LABEL, TRIGGER_MODE_LABEL } from "@/features/focus/focus-preferences";
import { useFocus } from "@/features/focus/focus-provider";
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
import { Button, Card, FieldLabel, ListRow, Notice, Screen, SectionHeader, Segmented, layout, useTextStyles } from "@/ui/components";
import { usePalette } from "@/ui/theme";

const SHORTCUTS: readonly TabScreen[] = ["focus", "goals", "review", "recovery", "days", "events", "calendar", "today"];

export default function SettingsScreen() {
  const text = useTextStyles();
  const router = useRouter();
  const openScreen = useOpenScreen();
  const { settings, update } = useSettings();
  const { snapshot } = useNotificationPermission();
  const { settings: focusSettings } = useFocus();

  return (
    <Screen>
      <AccountCard />
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
        <SectionHeader title="Focus" />
        <ListRow onPress={() => router.push("/settings/focus")} accessibilityLabel="Focus 설정">
          <View style={layout.flex}>
            <Text style={text.body}>Focus 설정</Text>
            <Text style={text.muted}>
              일정 시작 시 {TRIGGER_MODE_LABEL[focusSettings.triggerMode]} · {LOCK_MODE_LABEL[focusSettings.lockMode]}
            </Text>
          </View>
          <Text style={text.muted}>›</Text>
        </ListRow>
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
        {__DEV__ && (Platform.OS === "android" || Platform.OS === "ios") ? (
          <ListRow onPress={() => router.push("/dev/focus")} accessibilityLabel="Focus native 디버그">
            <View style={layout.flex}>
              <Text style={text.body}>{Platform.OS === "ios" ? "iOS Screen Time POC (개발 빌드)" : "Focus native 디버그 (개발 빌드)"}</Text>
              <Text style={text.muted}>
                {Platform.OS === "ios" ? "권한 · 앱 선택 · 5분 잠금 · 해제 · native 상태" : "접근성 서비스 · native 차단 상태 · 마지막 감지 앱"}
              </Text>
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

/** AUTH-005: the signed-in Google account and logout (server revoke → secure token deleted → caches cleared). */
function AccountCard() {
  const text = useTextStyles();
  const session = useAuthSession();
  const auth = useAuthState();
  const palette = usePalette();
  const [pending, setPending] = useState(false);
  if (auth.status !== "signedIn") return null;
  const { user } = auth;

  return (
    <Card>
      <SectionHeader title="계정" />
      <View style={[layout.rowWrap, { alignItems: "center", gap: 12 }]}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} accessibilityIgnoresInvertColors />
        ) : (
          <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: palette.accentSoft }}>
            <Text style={[text.strong, { color: palette.accent }]}>{user.displayName.slice(0, 1)}</Text>
          </View>
        )}
        <View style={layout.flex}>
          <Text style={text.strong}>{user.displayName}</Text>
          <Text style={text.muted}>{user.email}</Text>
          <Text style={text.muted}>Google로 로그인됨</Text>
        </View>
      </View>
      <Button
        label={pending ? "로그아웃 중…" : "로그아웃"}
        variant="danger"
        disabled={pending}
        onPress={() => {
          setPending(true);
          void session.logout().finally(() => setPending(false));
        }}
      />
      <Text style={text.muted}>이 기기에서만 로그아웃돼요. Google 계정은 로그아웃되지 않아요.</Text>
    </Card>
  );
}
