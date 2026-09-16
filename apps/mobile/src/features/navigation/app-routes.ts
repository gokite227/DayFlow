import type { GoalResponse } from "@dayflow/api-client";
import { DEFAULT_CALENDAR_VIEW, type CalendarView } from "../calendar/calendar-grid";
import { isCurrentGoal } from "../goals/goal-helpers";
import type { TabScreen } from "../settings/settings-model";
import type { TabRoute } from "./tab-navigation";

/**
 * Param names React Navigation reserves for nested navigation (`navigate(name, { screen, params })`).
 * Expo Router removes them from a route's params, so a route segment or query param with one of these
 * names arrives empty. `app/open/[screen].tsx` hit exactly this and always showed "화면을 찾을 수 없어요".
 */
export const RESERVED_NAVIGATION_PARAMS = ["screen", "params", "initial", "state", "path", "merge", "pop"] as const;

/** The dynamic segment of `app/open/[feature].tsx`. */
export const OPEN_SCREEN_PARAM = "feature";

export type ScreenParams = Record<string, string>;

/**
 * How to open a top-level screen. Every screen always exists as a route (`app/(tabs)/<screen>.tsx` and
 * `app/open/[feature].tsx`); the tab settings only decide whether it opens as its tab or stacked with a back button.
 */
export type ScreenLink =
  | { method: "navigate"; href: { pathname: `/${TabRoute}`; params?: ScreenParams } }
  | { method: "push"; href: { pathname: "/open/[feature]"; params: ScreenParams & { feature: TabScreen } } };

export function screenLink(screen: TabRoute, bottomTabs: readonly TabScreen[], params?: ScreenParams): ScreenLink {
  if (screen === "settings" || bottomTabs.includes(screen)) {
    return { method: "navigate", href: params ? { pathname: `/${screen}`, params } : { pathname: `/${screen}` } };
  }
  return { method: "push", href: { pathname: "/open/[feature]", params: { ...params, [OPEN_SCREEN_PARAM]: screen } } };
}

export interface CalendarLinkParams extends ScreenParams {
  date: string;
  view: CalendarView;
}

/**
 * Calendar link of a Goal detail ("이 기간 Calendar 보기"): WEEK opens the week view at the Goal's first day;
 * MONTH opens today when today is in the month, otherwise the month's first day. YEAR / QUARTER have no link.
 */
export function goalCalendarParams(goal: Pick<GoalResponse, "type" | "startDate" | "endDate">, today: string): CalendarLinkParams | null {
  if (goal.type === "WEEK") return { date: goal.startDate, view: "week" };
  if (goal.type === "MONTH") return { date: isCurrentGoal(goal, today) ? today : goal.startDate, view: DEFAULT_CALENDAR_VIEW };
  return null;
}
