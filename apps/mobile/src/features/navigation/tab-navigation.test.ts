import { describe, expect, it } from "vitest";
import { DEFAULT_BOTTOM_TABS } from "../settings/settings-model";
import { fallbackRouteForTabs, hiddenTabScreens, isTabScreen, tabRouteFromPathname, visibleTabRoutes } from "./tab-navigation";

const custom = ["today", "goals", "calendar", "review"] as const;

describe("bottom tab navigation", () => {
  it("shows the default tabs with Settings last", () => {
    expect(visibleTabRoutes(DEFAULT_BOTTOM_TABS)).toEqual(["today", "days", "calendar", "events", "settings"]);
    expect(hiddenTabScreens(DEFAULT_BOTTOM_TABS)).toEqual(["goals", "review", "recovery"]);
  });

  it("follows a customized configuration", () => {
    expect(visibleTabRoutes(custom)).toEqual(["today", "goals", "calendar", "review", "settings"]);
    expect(hiddenTabScreens(custom)).toEqual(["days", "events", "recovery"]);
  });

  it("keeps deep links such as Event detail reachable when Events is not a tab", () => {
    expect(fallbackRouteForTabs("/events/5555", custom)).toBeNull();
    expect(fallbackRouteForTabs("/open/events", custom)).toBeNull();
    expect(fallbackRouteForTabs("/settings/tabs", custom)).toBeNull();
  });

  it("moves to the first tab when the focused tab was removed", () => {
    expect(fallbackRouteForTabs("/days", custom)).toBe("/today");
    expect(fallbackRouteForTabs("/goals", custom)).toBeNull();
    expect(fallbackRouteForTabs("/settings", custom)).toBeNull();
    expect(fallbackRouteForTabs("/events", ["goals", "calendar", "review", "today"])).toBe("/goals");
  });

  it("recognizes tab routes and screen names", () => {
    expect(tabRouteFromPathname("/calendar")).toBe("calendar");
    expect(tabRouteFromPathname("/days/edit")).toBeNull();
    expect(isTabScreen("recovery")).toBe(true);
    expect(isTabScreen("settings")).toBe(false);
  });
});