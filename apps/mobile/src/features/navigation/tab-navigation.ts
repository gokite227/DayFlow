import { MAIN_TAB_COUNT, TAB_SCREENS, type TabScreen } from "../settings/settings-model";

export type TabRoute = TabScreen | "settings";

export const TAB_META: Record<TabRoute, { title: string; glyph: string; subtitle: string }> = {
  today: { title: "Today", glyph: "☀︎", subtitle: "오늘의 Day와 이번 주 목표" },
  days: { title: "Days", glyph: "☑︎", subtitle: "Task Inbox · 예정 · 미배치 · 완료" },
  calendar: { title: "Calendar", glyph: "▦", subtitle: "시간 계획 · 하루 / 3일 / 주" },
  events: { title: "Events", glyph: "◷", subtitle: "이미 정해진 일정" },
  goals: { title: "Goals", glyph: "◎", subtitle: "연간 · 분기 · 월간 · 주간 목표" },
  review: { title: "Review", glyph: "✎", subtitle: "KPT 회고" },
  recovery: { title: "Recovery", glyph: "↺", subtitle: "놓친 계획 정리 · Recovery Day" },
  settings: { title: "Settings", glyph: "⚙︎", subtitle: "화면 · 캘린더 · 알림" },
};

/** Tab bar order: the four configured screens, then Settings (always last, never configurable). */
export function visibleTabRoutes(bottomTabs: readonly TabScreen[]): TabRoute[] {
  return [...bottomTabs.slice(0, MAIN_TAB_COUNT), "settings"];
}

/** Screens registered in the tab navigator but without a tab button. */
export function hiddenTabScreens(bottomTabs: readonly TabScreen[]): TabScreen[] {
  return TAB_SCREENS.filter((screen) => !bottomTabs.includes(screen));
}

export function tabRouteFromPathname(pathname: string): TabRoute | null {
  const match = /^\/([a-z]+)\/?$/.exec(pathname);
  const name = match?.[1];
  if (name === "settings") return "settings";
  return name !== undefined && (TAB_SCREENS as readonly string[]).includes(name) ? (name as TabScreen) : null;
}

/**
 * After the tab configuration changed: if the focused route is a tab that is no longer in the tab bar,
 * go to the first tab. Any other route (Event detail from a notification, forms, stacked screens) stays.
 */
export function fallbackRouteForTabs(pathname: string, bottomTabs: readonly TabScreen[]): string | null {
  const route = tabRouteFromPathname(pathname);
  if (route === null || visibleTabRoutes(bottomTabs).includes(route)) return null;
  return `/${bottomTabs[0] ?? "today"}`;
}

export function isTabScreen(value: unknown): value is TabScreen {
  return typeof value === "string" && (TAB_SCREENS as readonly string[]).includes(value);
}