import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useLayoutEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConfigErrorScreen } from "@/components/config-error-screen";
import { setAuthSessionListeners } from "@/features/auth/auth-session";
import { useAuthSession, useAuthState } from "@/features/auth/use-auth";
import { configureForegroundPresentation } from "@/features/notifications/notification-adapter";
import { clearEventReminders } from "@/features/notifications/reconcile-service";
import { useEventReminderLifecycle } from "@/features/notifications/use-event-reminder-lifecycle";
import { FocusAutomationSignedOut, FocusAutomationSync } from "@/features/focus/focus-automation-sync";
import { FocusProvider } from "@/features/focus/focus-provider";
import { SettingsProvider, useSettings } from "@/features/settings/settings-provider";
import { apiConfig } from "@/lib/api-client";
import { createQueryClient, wireAppStateFocus } from "@/lib/query-client";
import { useAppTheme } from "@/ui/theme";
import { AppThemeProvider } from "@/ui/theme-provider";

// Must be set before any notification arrives, including one that launches the app.
configureForegroundPresentation();
// Keep the splash screen until stored settings (tabs, theme) and the sign-in state are known, so nothing flashes.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => wireAppStateFocus(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AppThemeProvider>
            {apiConfig.ok ? (
              <QueryClientProvider client={queryClient}>
                <AppNavigator />
              </QueryClientProvider>
            ) : (
              <ConfigErrorWithSplash />
            )}
          </AppThemeProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The navigator is always mounted (notification deep links need it); the splash screen covers loading.
 * AUTH-001: app screens exist only for a signed-in user; otherwise only the login (and its callback) do.
 */
function AppNavigator() {
  const { ready } = useSettings();
  const { scheme, palette } = useAppTheme();
  const queryClient = useQueryClient();
  const session = useAuthSession();
  const auth = useAuthState();
  const signedIn = auth.status === "signedIn";
  useEventReminderLifecycle(signedIn);

  // A user change (sign-in, sign-out, another account) drops every cached query before screens render again.
  useLayoutEffect(() => {
    setAuthSessionListeners({
      userChanged: () => {
        void queryClient.cancelQueries();
        queryClient.clear();
      },
      signedOut: () => void clearEventReminders(),
    });
  }, [queryClient]);

  useEffect(() => {
    void session.bootstrap();
  }, [session]);

  useEffect(() => {
    if (ready && auth.status !== "loading") void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready, auth.status]);

  // Focus is device-local and keeps running (and blocking) across sign-in changes, so it wraps the whole stack.
  return (
    <FocusProvider>
      {signedIn ? <FocusAutomationSync /> : auth.status === "signedOut" ? <FocusAutomationSignedOut /> : null}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerTintColor: palette.text,
          headerStyle: { backgroundColor: palette.background },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: palette.background },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="open/[feature]" options={{ title: "" }} />
          <Stack.Screen name="events/[eventId]" options={{ title: "일정" }} />
          <Stack.Screen name="events/edit" options={{ title: "일정", presentation: "modal" }} />
          <Stack.Screen name="goals/[goalId]" options={{ title: "목표" }} />
          <Stack.Screen name="goals/period-edit" options={{ title: "기간 목표", presentation: "modal" }} />
          <Stack.Screen name="days/edit" options={{ title: "Day", presentation: "modal" }} />
          <Stack.Screen name="review/try-to-day" options={{ title: "Day로 만들기", presentation: "modal" }} />
          <Stack.Screen name="review/detail" options={{ title: "회고" }} />
          <Stack.Screen name="focus/apps" options={{ title: "차단 앱", presentation: "modal" }} />
          <Stack.Screen name="settings/focus" options={{ title: "Focus 설정" }} />
          <Stack.Screen name="settings/tabs" options={{ title: "하단 탭 설정" }} />
          <Stack.Screen name="settings/notifications" options={{ title: "알림" }} />
          <Stack.Screen name="dev/notifications" options={{ title: "알림 디버그 (dev)" }} />
          <Stack.Screen name="dev/focus" options={{ title: "Focus native 디버그 (dev)" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
        {/* `dayflow://auth/callback` (Android delivers the login redirect to the app as well). */}
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      </Stack>
    </FocusProvider>
  );
}

function ConfigErrorWithSplash() {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  return apiConfig.ok ? null : <ConfigErrorScreen config={apiConfig} />;
}
