/**
 * Device-local app settings (no account sync yet). Every value read from storage goes through
 * parseSettings, so old or broken data falls back to defaults field by field instead of crashing.
 */
export const SETTINGS_VERSION = 1;

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const THEME_MODE_LABEL: Record<ThemeMode, string> = { system: "시스템 설정", light: "라이트", dark: "다크" };

/**
 * First day of the week in Calendar *display* only. Goal WEEK periods stay the canonical Monday-start
 * weeks of the server (GOAL-004) and Review weeks keep their own rule; this setting never changes them.
 */
export const WEEK_STARTS = ["monday", "sunday"] as const;
export type WeekStart = (typeof WEEK_STARTS)[number];
export const WEEK_START_LABEL: Record<WeekStart, string> = { monday: "월요일", sunday: "일요일" };

/** Screens that can occupy the four configurable bottom tab slots. Settings is always the fifth tab. */
export const TAB_SCREENS = ["today", "days", "calendar", "events", "goals", "review", "recovery", "focus"] as const;
export type TabScreen = (typeof TAB_SCREENS)[number];
export const MAIN_TAB_COUNT = 4;
export const DEFAULT_BOTTOM_TABS: readonly TabScreen[] = ["today", "days", "calendar", "events"];

export interface AppSettings {
  themeMode: ThemeMode;
  calendarWeekStart: WeekStart;
  bottomTabs: readonly TabScreen[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: "system",
  calendarWeekStart: "monday",
  bottomTabs: DEFAULT_BOTTOM_TABS,
};

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

/** Exactly four known, distinct screens; anything else means the defaults. */
export function sanitizeBottomTabs(value: unknown): readonly TabScreen[] {
  if (!Array.isArray(value) || value.length !== MAIN_TAB_COUNT) return DEFAULT_BOTTOM_TABS;
  if (!value.every((screen) => isOneOf(TAB_SCREENS, screen))) return DEFAULT_BOTTOM_TABS;
  return new Set(value).size === MAIN_TAB_COUNT ? (value as TabScreen[]) : DEFAULT_BOTTOM_TABS;
}

export function parseSettings(raw: unknown): AppSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS;
  const value = raw as Record<string, unknown>;
  return {
    themeMode: isOneOf(THEME_MODES, value.themeMode) ? value.themeMode : DEFAULT_SETTINGS.themeMode,
    calendarWeekStart: isOneOf(WEEK_STARTS, value.calendarWeekStart) ? value.calendarWeekStart : DEFAULT_SETTINGS.calendarWeekStart,
    bottomTabs: sanitizeBottomTabs(value.bottomTabs),
  };
}

export function serializeSettings(settings: AppSettings): string {
  return JSON.stringify({ version: SETTINGS_VERSION, ...settings });
}

/** Puts `screen` into slot `index`. If it already sits in another slot, the two slots swap (no duplicates). */
export function setBottomTab(tabs: readonly TabScreen[], index: number, screen: TabScreen): TabScreen[] {
  const next = [...tabs];
  if (index < 0 || index >= next.length) return next;
  const existing = next.indexOf(screen);
  const previous = next[index]!;
  next[index] = screen;
  if (existing !== -1 && existing !== index) next[existing] = previous;
  return next;
}

/** Moves slot `index` up (-1) or down (+1); out-of-range moves change nothing. */
export function moveBottomTab(tabs: readonly TabScreen[], index: number, delta: -1 | 1): TabScreen[] {
  const next = [...tabs];
  const target = index + delta;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export type ColorScheme = "light" | "dark";

/** "system" follows the OS appearance (unknown → light). */
export function resolveColorScheme(mode: ThemeMode, system: string | null | undefined): ColorScheme {
  if (mode === "light" || mode === "dark") return mode;
  return system === "dark" ? "dark" : "light";
}