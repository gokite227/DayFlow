import type { DayResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { dayFixture } from "../../test-fixtures";
import { categorizeApp, categorySelectionLabel, categorySelectionState, groupAppsByCategory } from "./app-categories";
import { searchApps, selectionCounts, selectionSummary, toggleApp, toggleApps } from "./app-selection";
import type { SelectableApp } from "./blocking-adapter";
import { focusScheduleId, nextScheduleBoundary, planFocusSchedules, planKey, scheduleProblem, scheduledFocusPrompt } from "./focus-automation";
import { EMPTY_FOCUS_STATE, type BlockedAppRef, type FocusState } from "./focus-model";
import {
  APP_DEFAULT_FOCUS_SETTINGS,
  needsAutoStrictConfirmation,
  parseDayPreferences,
  parseFocusSettings,
  pruneDayPreferences,
  resolveDayFocus,
  withDayPreference,
  type DayFocusPreferences,
  type FocusSettings,
} from "./focus-preferences";
import { reconcileFocus, stopFocus } from "./focus-service";
import { fakeNative } from "./focus-test-native";

const MINUTE = 60_000;
const NOW = new Date(2026, 8, 18, 13, 50).getTime();
const at = (hours: number, minutes: number) => new Date(2026, 8, 18, hours, minutes).toISOString();
const instagram: BlockedAppRef = { id: "com.instagram.android", label: "Instagram", category: "SOCIAL" };
const youtube: BlockedAppRef = { id: "com.google.android.youtube", label: "YouTube", category: "ENTERTAINMENT" };

function scheduledDay(id: string, start: string, end: string, overrides: Partial<DayResponse> = {}): DayResponse {
  return dayFixture({
    id,
    title: "수학 공부",
    plannedDate: "2026-09-18",
    schedule: { id: `s-${id}`, dayId: id, startAt: start, endAt: end, timezone: "Asia/Seoul", createdAt: start, updatedAt: start, version: 0 } as DayResponse["schedule"],
    ...overrides,
  });
}

const math = scheduledDay("math", at(14, 0), at(15, 30));

function plan(days: DayResponse[], settings: FocusSettings | null, preferences: DayFocusPreferences = {}, now = NOW) {
  return planFocusSchedules({ days, settings, preferences, defaultApps: [instagram], now });
}

describe("Settings resolution: Day override → Focus settings → app defaults", () => {
  it("falls back to the app defaults (ASK + FLEXIBLE) when nothing was saved", () => {
    expect(APP_DEFAULT_FOCUS_SETTINGS).toEqual({ triggerMode: "ASK", lockMode: "FLEXIBLE" });
    expect(resolveDayFocus(undefined, null, [instagram])).toEqual({
      triggerMode: "ASK",
      lockMode: "FLEXIBLE",
      apps: [instagram],
      source: { triggerMode: "app", lockMode: "app", apps: "default" },
    });
  });

  it("uses the global settings when the Day has no override", () => {
    expect(resolveDayFocus(undefined, { triggerMode: "NOTIFY_ONLY", lockMode: "STRICT" }, [])).toMatchObject({
      triggerMode: "NOTIFY_ONLY",
      lockMode: "STRICT",
      source: { triggerMode: "settings", lockMode: "settings" },
    });
  });

  it("a Day override wins, field by field", () => {
    const global: FocusSettings = { triggerMode: "ASK", lockMode: "FLEXIBLE" };
    expect(resolveDayFocus({ triggerMode: "AUTO", lockMode: "STRICT", apps: [youtube] }, global, [instagram])).toMatchObject({
      triggerMode: "AUTO",
      lockMode: "STRICT",
      apps: [youtube],
      source: { triggerMode: "day", lockMode: "day", apps: "day" },
    });
    expect(resolveDayFocus({ triggerMode: "DEFAULT", lockMode: "STRICT", apps: null }, global, [instagram])).toMatchObject({
      triggerMode: "ASK",
      lockMode: "STRICT",
      apps: [instagram],
    });
  });

  it("AUTO + STRICT asks for confirmation only when a setting turns into it", () => {
    expect(needsAutoStrictConfirmation({ triggerMode: "ASK", lockMode: "STRICT" }, { triggerMode: "AUTO", lockMode: "STRICT" })).toBe(true);
    expect(needsAutoStrictConfirmation({ triggerMode: "AUTO", lockMode: "FLEXIBLE" }, { triggerMode: "AUTO", lockMode: "STRICT" })).toBe(true);
    expect(needsAutoStrictConfirmation({ triggerMode: "AUTO", lockMode: "STRICT" }, { triggerMode: "AUTO", lockMode: "STRICT" })).toBe(false);
    expect(needsAutoStrictConfirmation({ triggerMode: "ASK", lockMode: "FLEXIBLE" }, { triggerMode: "ASK", lockMode: "STRICT" })).toBe(false);
  });

  it("stores overrides compactly, prunes deleted Days and reads stored data safely", () => {
    const withOverride = withDayPreference({}, "math", { triggerMode: "AUTO", lockMode: "DEFAULT", apps: null });
    expect(Object.keys(withOverride)).toEqual(["math"]);
    expect(withDayPreference(withOverride, "math", { triggerMode: "DEFAULT", lockMode: "DEFAULT", apps: null })).toEqual({});
    const pruned = pruneDayPreferences({ ...withOverride, gone: { triggerMode: "ASK", lockMode: "DEFAULT", apps: null } }, new Set(["math"]));
    expect(Object.keys(pruned)).toEqual(["math"]);
    expect(pruneDayPreferences(withOverride, new Set(["math"]))).toBe(withOverride);
    expect(parseFocusSettings(null)).toBeNull();
    expect(parseFocusSettings({ triggerMode: "WRONG", lockMode: "STRICT" })).toEqual({ triggerMode: "ASK", lockMode: "STRICT" });
    expect(parseDayPreferences({ a: { triggerMode: "AUTO", lockMode: "X", apps: [instagram, { id: 1 }] }, b: "broken", c: {} })).toEqual({
      a: { triggerMode: "AUTO", lockMode: "DEFAULT", apps: [instagram] },
    });
  });
});

describe("Trigger modes → OS schedules", () => {
  it("MANUAL schedules nothing", () => {
    expect(plan([math], { triggerMode: "MANUAL", lockMode: "STRICT" })).toEqual([]);
  });

  it("NOTIFY_ONLY is a plain start notification: no apps, no lock", () => {
    expect(plan([math], { triggerMode: "NOTIFY_ONLY", lockMode: "STRICT" })).toEqual([
      { id: "day:math", dayId: "math", title: "수학 공부", startAt: Date.parse(at(14, 0)), endAt: Date.parse(at(15, 30)), trigger: "NOTIFY_ONLY", lockMode: "FLEXIBLE", apps: [] },
    ]);
  });

  it("ASK and AUTO carry the lock mode and the apps; the Focus lasts exactly the schedule (90 minutes)", () => {
    const [ask] = plan([math], { triggerMode: "ASK", lockMode: "FLEXIBLE" });
    expect(ask).toMatchObject({ trigger: "ASK", lockMode: "FLEXIBLE", apps: [instagram] });
    const [auto] = plan([math], { triggerMode: "AUTO", lockMode: "STRICT" });
    expect(auto).toMatchObject({ trigger: "AUTO", lockMode: "STRICT", apps: [instagram] });
    expect((auto!.endAt - auto!.startAt) / MINUTE).toBe(90);
  });

  it("a Day override (AUTO + STRICT) applies to that Day only", () => {
    const other = scheduledDay("english", at(16, 0), at(17, 0), { title: "영어" });
    const entries = plan([math, other], { triggerMode: "ASK", lockMode: "FLEXIBLE" }, { math: { triggerMode: "AUTO", lockMode: "STRICT", apps: [youtube] } });
    expect(entries.map((entry) => [entry.dayId, entry.trigger, entry.lockMode, entry.apps.map((app) => app.id)])).toEqual([
      ["math", "AUTO", "STRICT", [youtube.id]],
      ["english", "ASK", "FLEXIBLE", [instagram.id]],
    ]);
    // "사용 안 함" for one Day.
    expect(plan([math, other], null, { math: { triggerMode: "MANUAL", lockMode: "DEFAULT", apps: null } }).map((entry) => entry.dayId)).toEqual(["english"]);
  });

  it("skips Days without a usable schedule: none, finished, ended, invalid, too long, too far ahead", () => {
    const days = [
      dayFixture({ id: "no-schedule", plannedDate: "2026-09-18" }),
      scheduledDay("done", at(14, 0), at(15, 0), { status: "DONE" }),
      scheduledDay("skipped", at(14, 0), at(15, 0), { status: "SKIPPED" }),
      scheduledDay("ended", at(12, 0), at(13, 0)),
      scheduledDay("reversed", at(15, 0), at(14, 0)),
      scheduledDay("long", at(14, 0), new Date(2026, 8, 19, 2, 1).toISOString()),
      scheduledDay("far", new Date(2026, 8, 26, 14, 0).toISOString(), new Date(2026, 8, 26, 15, 0).toISOString()),
      scheduledDay("running", at(13, 0), at(14, 30)),
    ];
    expect(plan(days, null).map((entry) => entry.dayId)).toEqual(["running"]);
    expect(scheduleProblem(days[3]!, NOW)).toBe("이미 지난 일정이에요.");
    expect(scheduleProblem(days[1]!, NOW)).toBe("끝난 Day예요.");
  });

  it("uses one stable id per Day", () => {
    expect(focusScheduleId("math")).toBe("day:math");
  });
});

describe("Schedule sync with the OS", () => {
  const settings: FocusSettings = { triggerMode: "AUTO", lockMode: "FLEXIBLE" };

  it("a changed start time replaces the schedule, and only the new time fires", () => {
    const env = fakeNative({ now: NOW });
    const scheduler = env.deps.adapter.scheduler;
    scheduler.sync(plan([math], settings));
    const moved = scheduledDay("math", at(14, 30), at(15, 30));
    const entries = plan([moved], settings);
    scheduler.sync(entries);
    expect([...env.alarms.entries()]).toEqual([["day:math", Date.parse(at(14, 30))]]);
    env.advance(10 * MINUTE); // 14:00, the old time
    env.fireAlarm("day:math");
    expect(env.deps.adapter.getStatus().active).toBe(false);
    env.advance(30 * MINUTE); // 14:30
    env.fireAlarm("day:math");
    expect(env.deps.adapter.getStatus()).toMatchObject({ active: true, endsAt: Date.parse(at(15, 30)) });
    expect(env.notifications).toEqual(["수학 공부 집중 모드가 시작됐어요"]);
  });

  it("a deleted, unscheduled or completed Day cancels its schedule", () => {
    const env = fakeNative({ now: NOW });
    const scheduler = env.deps.adapter.scheduler;
    scheduler.sync(plan([math], settings));
    expect(env.alarms.has("day:math")).toBe(true);
    scheduler.sync(plan([], settings));
    expect(env.alarms.size).toBe(0);
    scheduler.sync(plan([math], settings));
    scheduler.sync(plan([{ ...math, schedule: null }], settings));
    expect(scheduler.list()).toEqual([]);
    scheduler.sync(plan([math], settings));
    scheduler.sync(plan([{ ...math, status: "DONE" }], settings));
    expect(scheduler.list()).toEqual([]);
  });

  it("changing the trigger mode or a Day override re-plans; the same plan is not synced twice", () => {
    const first = plan([math], settings);
    expect(planKey(plan([math], settings))).toBe(planKey(first));
    expect(planKey(plan([math], { ...settings, lockMode: "STRICT" }))).not.toBe(planKey(first));
    expect(planKey(plan([math], settings, { math: { triggerMode: "ASK", lockMode: "DEFAULT", apps: null } }))).not.toBe(planKey(first));
    expect(plan([math], { triggerMode: "MANUAL", lockMode: "FLEXIBLE" })).toEqual([]);
  });

  it("syncing the same schedules again never adds a second alarm", () => {
    const env = fakeNative({ now: NOW });
    const entries = plan([math, scheduledDay("english", at(16, 0), at(17, 0))], settings);
    env.deps.adapter.scheduler.sync(entries);
    env.deps.adapter.scheduler.sync([...entries, ...entries]);
    expect([...env.alarms.keys()].sort()).toEqual(["day:english", "day:math"]);
    expect(env.deps.adapter.scheduler.list()).toHaveLength(2);
  });

  it("the next schedule boundary refreshes the open app", () => {
    expect(nextScheduleBoundary([{ id: "day:math", dayId: "math", title: "", startAt: NOW + MINUTE, endAt: NOW + 90 * MINUTE, trigger: "ASK", lockMode: "FLEXIBLE", appIds: [], status: "SCHEDULED" }], NOW)).toBe(
      NOW + MINUTE,
    );
    expect(nextScheduleBoundary([], NOW)).toBeNull();
  });
});

describe("Scheduled start per trigger mode", () => {
  const startAt14 = 10 * MINUTE;

  function run(settings: FocusSettings, preferences: DayFocusPreferences = {}) {
    const env = fakeNative({ now: NOW });
    env.deps.adapter.scheduler.sync(plan([math], settings, preferences));
    env.advance(startAt14);
    env.fireAlarm("day:math");
    return env;
  }

  it("NOTIFY_ONLY: a notification, no Focus session and no blocking", () => {
    const env = run({ triggerMode: "NOTIFY_ONLY", lockMode: "STRICT" });
    expect(env.notifications).toEqual(["수학 공부 시작할 시간이에요"]);
    expect(env.deps.adapter.getStatus().active).toBe(false);
    expect(reconcileFocus(EMPTY_FOCUS_STATE, env.deps)).toEqual({ state: EMPTY_FOCUS_STATE, action: "none" });
    expect(scheduledFocusPrompt(env.deps.adapter.scheduler.list(), EMPTY_FOCUS_STATE, NOW + startAt14)).toBeNull();
  });

  it("ASK accepted: the Focus starts until the schedule ends, linked to the Day", () => {
    const env = run({ triggerMode: "ASK", lockMode: "FLEXIBLE" });
    expect(env.notifications).toEqual(["수학 공부을(를) 시작할까요?"]);
    expect(env.deps.adapter.getStatus().active).toBe(false);
    const prompt = scheduledFocusPrompt(env.deps.adapter.scheduler.list(), EMPTY_FOCUS_STATE, NOW + startAt14);
    expect(prompt).toMatchObject({ id: "day:math", status: "ASKED" });
    env.deps.adapter.scheduler.accept(prompt!.id);
    const result = reconcileFocus(EMPTY_FOCUS_STATE, env.deps);
    expect(result.action).toBe("recovered");
    expect(result.state.current).toMatchObject({
      status: "ACTIVE",
      dayId: "math",
      dayTitle: "수학 공부",
      origin: "ASK",
      lockMode: "FLEXIBLE",
      endsAt: at(15, 30),
      durationMinutes: 90,
      blockedApps: [{ id: instagram.id, label: "Instagram" }],
    });
    expect(scheduledFocusPrompt(env.deps.adapter.scheduler.list(), result.state, NOW + startAt14)).toBeNull();
  });

  it("ASK dismissed (나중에) or ignored: nothing starts and the prompt does not come back", () => {
    const env = run({ triggerMode: "ASK", lockMode: "FLEXIBLE" });
    env.deps.adapter.scheduler.dismiss("day:math");
    expect(env.deps.adapter.getStatus().active).toBe(false);
    expect(scheduledFocusPrompt(env.deps.adapter.scheduler.list(), EMPTY_FOCUS_STATE, NOW + startAt14)).toBeNull();
    env.deps.adapter.scheduler.accept("day:math");
    expect(env.deps.adapter.getStatus().active).toBe(false);

    const ignored = run({ triggerMode: "ASK", lockMode: "FLEXIBLE" });
    ignored.advance(90 * MINUTE);
    expect(ignored.deps.adapter.getStatus().active).toBe(false);
    expect(scheduledFocusPrompt(ignored.deps.adapter.scheduler.list(), EMPTY_FOCUS_STATE, NOW + startAt14 + 90 * MINUTE)).toBeNull();
  });

  it("AUTO + FLEXIBLE: starts without asking and can be ended", () => {
    const env = run({ triggerMode: "AUTO", lockMode: "FLEXIBLE" });
    expect(env.notifications).toEqual(["수학 공부 집중 모드가 시작됐어요"]);
    const state = reconcileFocus(EMPTY_FOCUS_STATE, env.deps).state;
    expect(state.current).toMatchObject({ status: "ACTIVE", origin: "AUTO", lockMode: "FLEXIBLE", dayId: "math" });
    expect(stopFocus(state, env.deps)).toMatchObject({ locked: false, state: { current: { status: "CANCELLED" } } });
  });

  it("AUTO + STRICT (Day override over ASK + FLEXIBLE): locked until the schedule ends, then COMPLETED", () => {
    const env = run({ triggerMode: "ASK", lockMode: "FLEXIBLE" }, { math: { triggerMode: "AUTO", lockMode: "STRICT", apps: null } });
    expect(env.notifications).toEqual(["수학 공부 강제 집중이 시작됐어요"]);
    let state: FocusState = reconcileFocus(EMPTY_FOCUS_STATE, env.deps).state;
    expect(state.current).toMatchObject({ lockMode: "STRICT", origin: "AUTO" });
    expect(stopFocus(state, env.deps)).toMatchObject({ locked: true });
    expect(env.deps.adapter.getStatus().active).toBe(true);
    env.advance(90 * MINUTE);
    state = reconcileFocus(state, env.deps).state;
    expect(state.current).toMatchObject({ status: "COMPLETED", completedAt: at(15, 30) });
  });

  it("AUTO while another Focus runs leaves the running one alone", () => {
    const env = fakeNative({ now: NOW });
    env.deps.adapter.scheduler.sync(plan([math], { triggerMode: "AUTO", lockMode: "STRICT" }));
    env.startOutside(60, [youtube.id]);
    env.advance(startAt14);
    env.fireAlarm("day:math");
    expect(env.deps.adapter.getStatus().blockedAppIds).toEqual([youtube.id]);
    expect(env.deps.adapter.scheduler.list()[0]?.status).toBe("SKIPPED");
  });
});

describe("App categories", () => {
  const app = (id: string, label: string, osCategory: string | null): SelectableApp => ({ id, label, osCategory, iconUri: null, isSystemApp: false });
  const apps = [
    app("com.instagram.android", "Instagram", "UNDEFINED"),
    app("com.discord", "Discord", null),
    app("com.example.chat", "Chat", "SOCIAL"),
    app("com.supercell.clashroyale", "Clash Royale", "GAME"),
    app("com.google.android.youtube", "YouTube", "VIDEO"),
    app("com.example.notes", "Notes", "PRODUCTIVITY"),
    app("com.example.camera", "Camera", "IMAGE"),
    app("com.example.unknown", "Unknown", "UNDEFINED"),
  ];

  it("maps known apps, then OS categories, and puts unknown apps in 기타", () => {
    expect(categorizeApp(apps[0]!)).toBe("SOCIAL");
    expect(categorizeApp(apps[2]!)).toBe("SOCIAL");
    expect(categorizeApp(apps[3]!)).toBe("GAMES");
    expect(categorizeApp(apps[6]!)).toBe("OTHER");
    expect(categorizeApp(apps[7]!)).toBe("OTHER");
    expect(categorizeApp(app("x.y", "Y", "MAPS"))).toBe("TRAVEL");
    expect(categorizeApp(app("x.y", "Y", "SOMETHING_NEW"))).toBe("OTHER");
    // A manual override wins over everything.
    expect(categorizeApp(apps[0]!, { "com.instagram.android": "ENTERTAINMENT" })).toBe("ENTERTAINMENT");
  });

  it("groups apps by category in a fixed order", () => {
    expect(groupAppsByCategory(apps).map((group) => [group.label, group.apps.map((entry) => entry.label)])).toEqual([
      ["소셜 미디어", ["Instagram", "Discord", "Chat"]],
      ["게임", ["Clash Royale"]],
      ["영상 · 엔터테인먼트", ["YouTube"]],
      ["생산성", ["Notes"]],
      ["기타", ["Camera", "Unknown"]],
    ]);
  });

  it("category state NONE → ALL → PARTIAL → NONE", () => {
    const social = groupAppsByCategory(apps)[0]!.apps;
    let selected: BlockedAppRef[] = [];
    const ids = () => new Set(selected.map((entry) => entry.id));
    expect(categorySelectionState(social, ids())).toBe("NONE");
    expect(categorySelectionLabel(social, ids())).toBe("선택 안 함");
    selected = toggleApps(selected, social);
    expect(categorySelectionState(social, ids())).toBe("ALL");
    expect(categorySelectionLabel(social, ids())).toBe("전체 선택");
    selected = toggleApp(selected, social[1]!);
    expect(categorySelectionState(social, ids())).toBe("PARTIAL");
    expect(categorySelectionLabel(social, ids())).toBe("2개 선택");
    // A PARTIAL category row selects the rest; an ALL row clears only that category.
    selected = toggleApps(selected, social);
    expect(categorySelectionState(social, ids())).toBe("ALL");
    selected = toggleApp(selected, apps[4]!);
    selected = toggleApps(selected, social);
    expect(selected.map((entry) => entry.id)).toEqual(["com.google.android.youtube"]);
  });

  it("모든 앱 selects and clears every blockable app", () => {
    let selected = toggleApps([], apps);
    expect(categorySelectionState(apps, new Set(selected.map((entry) => entry.id)))).toBe("ALL");
    expect(selectionCounts(selected)).toEqual({ categories: 5, apps: 8 });
    selected = toggleApps(selected, apps);
    expect(selected).toEqual([]);
  });

  it("a selection made in search results keeps the rest and updates the original category at once", () => {
    const social = groupAppsByCategory(apps)[0]!.apps;
    let selected = toggleApps([], social);
    selected = toggleApp(selected, apps[4]!);
    const results = searchApps(apps, "disc");
    expect(results.map((entry) => entry.label)).toEqual(["Discord"]);
    selected = toggleApp(selected, results[0]!);
    // Search cleared: everything else stays selected, and 소셜 미디어 is now PARTIAL.
    const ids = new Set(selected.map((entry) => entry.id));
    expect([...ids].sort()).toEqual(["com.example.chat", "com.google.android.youtube", "com.instagram.android"]);
    expect(categorySelectionState(social, ids)).toBe("PARTIAL");
    expect(selectionSummary(selected)).toBe("소셜 미디어 외 1개 카테고리 · 3개 앱");
  });

  it("summaries: no apps, one category, several categories", () => {
    expect(selectionSummary([])).toBe("차단 앱 없음");
    expect(selectionSummary([instagram])).toBe("소셜 미디어 · 1개 앱");
    expect(selectionSummary([youtube, instagram, { id: "a.b", label: "C" }])).toBe("소셜 미디어 외 2개 카테고리 · 3개 앱");
  });
});
