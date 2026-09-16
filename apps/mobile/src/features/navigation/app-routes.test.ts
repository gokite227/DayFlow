import { describe, expect, it } from "vitest";
import { routeForPayload } from "../notifications/notification-payload";
import { DEFAULT_BOTTOM_TABS, TAB_SCREENS, type TabScreen } from "../settings/settings-model";
import { OPEN_SCREEN_PARAM, RESERVED_NAVIGATION_PARAMS, goalCalendarParams, screenLink } from "./app-routes";
import { fallbackRouteForTabs, visibleTabRoutes } from "./tab-navigation";

declare global {
  interface ImportMeta {
    /** Vite (vitest) lists matching files; the lazy loaders are never called, so no screen is imported. */
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const routeFiles = new Set(Object.keys(import.meta.glob("../../../app/**/*.tsx")).map((file) => file.replace("../../../app/", "")));
const withoutGoalsReviewRecovery: readonly TabScreen[] = ["today", "days", "calendar", "events"];
const withoutEvents: readonly TabScreen[] = ["today", "days", "calendar", "goals"];
const withoutCalendar: readonly TabScreen[] = ["today", "goals", "review", "recovery"];

describe("Goal → Calendar link", () => {
  it("opens a WEEK Goal as the week view at its first day", () => {
    const params = goalCalendarParams({ type: "WEEK", startDate: "2026-09-14", endDate: "2026-09-20" }, "2026-09-16");
    expect(params).toEqual({ date: "2026-09-14", view: "week" });
    expect(screenLink("calendar", withoutCalendar, params!)).toEqual({
      method: "push",
      href: { pathname: "/open/[feature]", params: { date: "2026-09-14", view: "week", feature: "calendar" } },
    });
    expect(screenLink("calendar", DEFAULT_BOTTOM_TABS, params!)).toEqual({
      method: "navigate",
      href: { pathname: "/calendar", params: { date: "2026-09-14", view: "week" } },
    });
  });

  it("opens a MONTH Goal at today inside the month, otherwise at its first day", () => {
    expect(goalCalendarParams({ type: "MONTH", startDate: "2026-09-01", endDate: "2026-09-30" }, "2026-09-16")).toEqual({ date: "2026-09-16", view: "day" });
    expect(goalCalendarParams({ type: "MONTH", startDate: "2026-11-01", endDate: "2026-11-30" }, "2026-09-16")).toEqual({ date: "2026-11-01", view: "day" });
  });

  it("has no Calendar link for YEAR and QUARTER Goals", () => {
    expect(goalCalendarParams({ type: "YEAR", startDate: "2026-01-01", endDate: "2026-12-31" }, "2026-09-16")).toBeNull();
    expect(goalCalendarParams({ type: "QUARTER", startDate: "2026-07-01", endDate: "2026-09-30" }, "2026-09-16")).toBeNull();
  });
});

describe("Settings shortcuts and hidden screens", () => {
  it.each(["goals", "review", "recovery"] as const)("Settings → %s opens a stacked screen when it is not a tab", (screen) => {
    expect(screenLink(screen, withoutGoalsReviewRecovery)).toEqual({ method: "push", href: { pathname: "/open/[feature]", params: { feature: screen } } });
  });

  it("opens a screen as its tab when it is in the tab bar, and Settings always as its tab", () => {
    expect(screenLink("goals", withoutCalendar)).toEqual({ method: "navigate", href: { pathname: "/goals" } });
    expect(screenLink("settings", withoutCalendar)).toEqual({ method: "navigate", href: { pathname: "/settings" } });
  });

  it("builds a working link for every screen under any tab configuration", () => {
    for (const tabs of [DEFAULT_BOTTOM_TABS, withoutGoalsReviewRecovery, withoutEvents, withoutCalendar]) {
      for (const screen of TAB_SCREENS) {
        const link = screenLink(screen, tabs);
        if (visibleTabRoutes(tabs).includes(screen)) expect(link.href.pathname).toBe(`/${screen}`);
        else expect(link).toEqual({ method: "push", href: { pathname: "/open/[feature]", params: { feature: screen } } });
      }
    }
  });

  it("never uses a param name that navigation silently drops (the old /open/[screen] bug)", () => {
    expect(RESERVED_NAVIGATION_PARAMS).toContain("screen");
    expect(RESERVED_NAVIGATION_PARAMS).not.toContain(OPEN_SCREEN_PARAM);
    const params = goalCalendarParams({ type: "WEEK", startDate: "2026-09-14", endDate: "2026-09-20" }, "2026-09-16")!;
    const link = screenLink("calendar", withoutCalendar, params);
    for (const key of Object.keys(link.href.params ?? {})) expect(RESERVED_NAVIGATION_PARAMS).not.toContain(key);
  });
});

describe("route existence does not depend on tab settings", () => {
  it("has a route file for every screen, independent of the tab bar", () => {
    for (const screen of [...TAB_SCREENS, "settings"]) expect(routeFiles).toContain(`(tabs)/${screen}.tsx`);
    expect(routeFiles).toContain(`open/[${OPEN_SCREEN_PARAM}].tsx`);
    expect(routeFiles).not.toContain("open/[screen].tsx");
    expect(routeFiles).toContain("events/[eventId].tsx");
  });

  it("opens Event detail from a notification even when Events is not a tab", () => {
    const route = routeForPayload({ eventId: "0b6f7a52-51e4-4f4b-9d8e-6c1f1b0c1a11", occurrenceStartAt: "2026-09-16T09:00:00+09:00" });
    expect(route).toEqual({
      pathname: "/events/[eventId]",
      params: { eventId: "0b6f7a52-51e4-4f4b-9d8e-6c1f1b0c1a11", occurrence: "2026-09-16T09:00:00+09:00" },
    });
    for (const key of Object.keys(route!.params)) expect(RESERVED_NAVIGATION_PARAMS).not.toContain(key);
    expect(fallbackRouteForTabs("/events/0b6f7a52-51e4-4f4b-9d8e-6c1f1b0c1a11", withoutEvents)).toBeNull();
    expect(fallbackRouteForTabs("/open/events", withoutEvents)).toBeNull();
  });
});
