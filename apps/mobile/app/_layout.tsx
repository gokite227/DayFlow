import { QueryClientProvider } from "@tanstack/react-query";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConfigErrorScreen } from "@/components/config-error-screen";
import { configureForegroundPresentation } from "@/features/notifications/notification-adapter";
import { useEventReminderLifecycle } from "@/features/notifications/use-event-reminder-lifecycle";
import { SettingsProvider, useSettings } from "@/features/settings/settings-provider";
import { apiConfig } from "@/lib/api-client";
import { createQueryClient, wireAppStateFocus } from "@/lib/query-client";
import { useAppTheme } from "@/ui/theme";
import { AppThemeProvider } from "@/ui/theme-provider";

// Must be set before any notification arrives, including one that launches the app.
configureForegroundPresentation();
// Keep the splash screen until stored settings (tabs, theme) are read, so defaults never flash.
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

/** The navigator is always mounted (notification deep links need it); the splash screen covers loading. */
function AppNavigator() {
  const { ready } = useSettings();
  const { scheme, palette } = useAppTheme();
  useEventReminderLifecycle();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  return (
    <>
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="open/[feature]" options={{ title: "" }} />
        <Stack.Screen name="events/[eventId]" options={{ title: "일정" }} />
        <Stack.Screen name="events/edit" options={{ title: "일정", presentation: "modal" }} />
        <Stack.Screen name="goals/[goalId]" options={{ title: "목표" }} />
        <Stack.Screen name="days/edit" options={{ title: "Day", presentation: "modal" }} />
        <Stack.Screen name="review/try-to-day" options={{ title: "Day로 만들기", presentation: "modal" }} />
        <Stack.Screen name="settings/tabs" options={{ title: "하단 탭 설정" }} />
        <Stack.Screen name="settings/notifications" options={{ title: "알림" }} />
        <Stack.Screen name="dev/notifications" options={{ title: "알림 디버그 (dev)" }} />
      </Stack>
    </>
  );
}
function ConfigErrorWithSplash() {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  return apiConfig.ok ? null : <ConfigErrorScreen config={apiConfig} />;
}