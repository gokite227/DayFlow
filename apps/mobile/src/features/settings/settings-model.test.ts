import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  moveBottomTab,
  parseSettings,
  resolveColorScheme,
  sanitizeBottomTabs,
  serializeSettings,
  setBottomTab,
} from "./settings-model";

describe("settings defaults and persistence", () => {
  it("defaults to system theme, Monday week start and Today / Days / Calendar / Events", () => {
    expect(DEFAULT_SETTINGS).toEqual({ themeMode: "system", calendarWeekStart: "monday", bottomTabs: ["today", "days", "calendar", "events"] });
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("broken")).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips stored values, including Sunday week start", () => {
    const settings = { themeMode: "dark", calendarWeekStart: "sunday", bottomTabs: ["goals", "calendar", "review", "today"] } as const;
    expect(parseSettings(JSON.parse(serializeSettings(settings)))).toEqual(settings);
  });

  it("falls back field by field for invalid or old data", () => {
    expect(parseSettings({ themeMode: "sepia", calendarWeekStart: "sunday", bottomTabs: ["today"] })).toEqual({
      ...DEFAULT_SETTINGS,
      calendarWeekStart: "sunday",
    });
    expect(sanitizeBottomTabs(["today", "today", "days", "events"])).toEqual(DEFAULT_SETTINGS.bottomTabs);
    expect(sanitizeBottomTabs(["today", "settings", "days", "events"])).toEqual(DEFAULT_SETTINGS.bottomTabs);
    expect(sanitizeBottomTabs(["today", "days", "calendar", "events", "goals"])).toEqual(DEFAULT_SETTINGS.bottomTabs);
  });
});

describe("bottom tab editing", () => {
  const tabs = DEFAULT_SETTINGS.bottomTabs;

  it("changes a slot and swaps instead of duplicating", () => {
    expect(setBottomTab(tabs, 1, "goals")).toEqual(["today", "goals", "calendar", "events"]);
    expect(setBottomTab(tabs, 0, "events")).toEqual(["events", "days", "calendar", "today"]);
    expect(setBottomTab(tabs, 9, "goals")).toEqual([...tabs]);
  });

  it("reorders slots within bounds", () => {
    expect(moveBottomTab(tabs, 2, -1)).toEqual(["today", "calendar", "days", "events"]);
    expect(moveBottomTab(tabs, 3, 1)).toEqual([...tabs]);
    expect(moveBottomTab(tabs, 0, -1)).toEqual([...tabs]);
  });
});

describe("theme mode", () => {
  it("resolves system, light and dark", () => {
    expect(resolveColorScheme("system", "dark")).toBe("dark");
    expect(resolveColorScheme("system", "light")).toBe("light");
    expect(resolveColorScheme("system", null)).toBe("light");
    expect(resolveColorScheme("light", "dark")).toBe("light");
    expect(resolveColorScheme("dark", "light")).toBe("dark");
  });
});