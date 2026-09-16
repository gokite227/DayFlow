import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, type Theme } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { useEffect, useMemo, type ReactNode } from "react";
import { Appearance, useColorScheme } from "react-native";
import { resolveColorScheme } from "@/features/settings/settings-model";
import { useSettings } from "@/features/settings/settings-provider";
import { DARK_THEME, LIGHT_THEME, ThemeContext } from "./theme";

/**
 * Applies Settings > 화면 모드. The mode is also passed to the OS appearance override, so native pieces
 * (date pickers, alerts, keyboard) follow the chosen mode; "system" clears the override.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const systemScheme = useColorScheme();

  useEffect(() => {
    Appearance.setColorScheme(settings.themeMode === "system" ? "unspecified" : settings.themeMode);
  }, [settings.themeMode]);

  const theme = resolveColorScheme(settings.themeMode, systemScheme) === "dark" ? DARK_THEME : LIGHT_THEME;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.palette.background).catch(() => undefined);
  }, [theme]);

  const navigationTheme = useMemo<Theme>(() => {
    const base = theme.scheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.palette.accent,
        background: theme.palette.background,
        card: theme.palette.surface,
        text: theme.palette.text,
        border: theme.palette.border,
        notification: theme.palette.accent,
      },
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}