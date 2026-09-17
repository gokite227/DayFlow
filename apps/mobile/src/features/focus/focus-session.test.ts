import { describe, expect, it } from "vitest";
import { dayFixture } from "../../test-fixtures";
import { searchApps, selectionForInstalledApps, selectionSummary, toggleApp } from "./app-selection";
import { unsupportedBlockingAdapter, type SelectableApp } from "./blocking-adapter";
import { canFocusOnDay, focusDayCandidates, formatCountdown, formatKoreanClockTime, parseCustomMinutes, runningPermissionNotice, runningTitle, strictConfirmation } from "./focus-display";
import {
  EMPTY_FOCUS_STATE,
  acknowledgeEnd,
  canStopFocus,
  needsEndPrompt,
  parseAppSelection,
  parseFocusState,
  reconcileFocusSession,
  remainingSeconds,
  type BlockedAppRef,
  type FocusState,
} from "./focus-model";
import { reconcileFocus, startFocus, stopFocus, type FocusDeps, type StartFocusResult } from "./focus-service";
import { fakeNative } from "./focus-test-native";

const T0 = new Date(2026, 8, 18, 15, 30).getTime();
const youtube: BlockedAppRef = { id: "com.google.android.youtube", label: "YouTube" };
const instagram: BlockedAppRef = { id: "com.instagram.android", label: "Instagram" };
const day = { id: "day-1", title: "알고리즘 2문제" };
const FLEX = "FLEXIBLE" as const;
const STRICT = "STRICT" as const;

function started(result: StartFocusResult): FocusState {
  if (!result.ok) throw new Error(`expected a started Focus, got ${result.reason}`);
  return result.state;
}

describe("Focus start", () => {
  it("starts linked to a Day: native blocking first, the native end time is the session end", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube, instagram], lockMode: FLEX }, env.deps));
    expect(env.calls).toEqual(["start:com.google.android.youtube,com.instagram.android:FLEXIBLE"]);
    expect(state.current).toMatchObject({
      dayId: "day-1",
      dayTitle: "알고리즘 2문제",
      status: "ACTIVE",
      lockMode: "FLEXIBLE",
      origin: "MANUAL",
      durationMinutes: 25,
      startedAt: new Date(T0).toISOString(),
      endsAt: new Date(T0 + 25 * 60_000).toISOString(),
      blockedApps: [youtube, instagram],
      blockingEngaged: true,
      completedAt: null,
    });
    expect(env.deps.adapter.getStatus().session).toMatchObject({ id: state.current!.id, dayId: "day-1", lockMode: "FLEXIBLE" });
    expect(remainingSeconds(state.current!, T0 + 60_000)).toBe(24 * 60);
  });

  it("starts without a Day", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day: null, durationMinutes: 50, apps: [youtube], lockMode: FLEX }, env.deps));
    expect(state.current).toMatchObject({ dayId: null, dayTitle: null, durationMinutes: 50, status: "ACTIVE" });
  });

  it("with no apps selected it is a timer, FLEXIBLE or STRICT: no permission needed, nothing blocked", () => {
    const env = fakeNative({ now: T0, permission: "required" });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day: null, durationMinutes: 25, apps: [], lockMode: STRICT }, env.deps));
    expect(env.calls).toEqual(["start::STRICT"]);
    expect(state.current).toMatchObject({ blockedApps: [], status: "ACTIVE", lockMode: "STRICT" });
    expect(canStopFocus(state.current!, T0 + 60_000)).toBe(false);
  });

  it("asks for the permission instead of starting when apps are selected but blocking is not allowed", () => {
    const env = fakeNative({ now: T0, permission: "required" });
    expect(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, env.deps)).toEqual({ ok: false, reason: "permission-required" });
    expect(env.calls).toEqual([]);
  });

  it("refuses a second Focus while one is running, and out-of-range durations", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, env.deps));
    const again = startFocus(state, { day: { id: "day-2", title: "다른 Day" }, durationMinutes: 25, apps: [], lockMode: FLEX }, env.deps);
    expect(again).toMatchObject({ ok: false, reason: "active", session: { dayId: "day-1" } });
    expect(env.calls).toHaveLength(1);
    expect(startFocus(EMPTY_FOCUS_STATE, { day: null, durationMinutes: 0, apps: [], lockMode: FLEX }, env.deps)).toMatchObject({ ok: false, reason: "invalid-duration" });
    expect(startFocus(EMPTY_FOCUS_STATE, { day: null, durationMinutes: 721, apps: [], lockMode: FLEX }, env.deps)).toMatchObject({ ok: false, reason: "invalid-duration" });
    expect(parseCustomMinutes("40")).toEqual({ ok: true, minutes: 40 });
    expect(parseCustomMinutes("4.5")).toEqual({ ok: false });
  });

  it("a schedule based start ends with the schedule, without entering minutes", () => {
    const env = fakeNative({ now: T0 });
    const end = T0 + 90 * 60_000;
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 0, endsAt: end, apps: [youtube], lockMode: FLEX, origin: "ASK" }, env.deps));
    expect(state.current).toMatchObject({ durationMinutes: 90, endsAt: new Date(end).toISOString(), origin: "ASK" });
    expect(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 0, endsAt: T0, apps: [], lockMode: FLEX }, fakeNative({ now: T0 }).deps)).toMatchObject({
      ok: false,
      reason: "invalid-duration",
    });
  });

  it("reports a native failure instead of throwing", () => {
    const env = fakeNative({ now: T0 });
    const broken: FocusDeps = {
      ...env.deps,
      adapter: {
        ...env.deps.adapter,
        startBlocking: () => {
          throw new Error("ERR_INVALID_PACKAGE");
        },
      },
    };
    expect(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, broken)).toEqual({
      ok: false,
      reason: "native-error",
      message: "ERR_INVALID_PACKAGE",
    });
  });

  it("works as a timer on a build without native blocking (iOS today)", () => {
    const env = fakeNative({ now: T0 });
    const deps: FocusDeps = { ...env.deps, adapter: unsupportedBlockingAdapter };
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: STRICT }, deps));
    expect(state.current).toMatchObject({ blockedApps: [], blockingEngaged: false, lockMode: "STRICT", endsAt: new Date(T0 + 25 * 60_000).toISOString() });
    expect(stopFocus(state, deps)).toMatchObject({ locked: true });
    env.advance(25 * 60_000);
    expect(reconcileFocus(state, deps)).toMatchObject({ action: "completed", state: { current: { status: "COMPLETED" } } });
  });
});

describe("Lock mode", () => {
  it("FLEXIBLE: manual end lifts native blocking at once and cancels the session", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, env.deps));
    env.advance(5 * 60_000);
    expect(canStopFocus(state.current!, T0 + 5 * 60_000)).toBe(true);
    const stopped = stopFocus(state, env.deps);
    expect(env.calls).toContain("stop");
    expect(env.deps.adapter.getStatus().active).toBe(false);
    expect(stopped).toMatchObject({ nativeError: null, locked: false, state: { current: { status: "CANCELLED", completedAt: new Date(T0 + 5 * 60_000).toISOString() } } });
    expect(stopFocus(stopped.state, env.deps).state).toBe(stopped.state);
  });

  it("STRICT: a manual stop is refused before the end, in JS and in native", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 50, apps: [youtube], lockMode: STRICT }, env.deps));
    env.advance(49 * 60_000);
    const result = stopFocus(state, env.deps);
    expect(result).toMatchObject({ locked: true, nativeError: null });
    expect(result.state).toBe(state);
    expect(env.calls).not.toContain("stop");
    expect(env.deps.adapter.getStatus().active).toBe(true);
    // Even a direct native call cannot end it early.
    expect(() => env.deps.adapter.stopBlocking()).toThrow("ERR_FOCUS_LOCKED");
    // Nor can another Focus replace it.
    expect(startFocus(state, { day: null, durationMinutes: 1, apps: [], lockMode: FLEX }, env.deps)).toMatchObject({ ok: false, reason: "active" });
  });

  it("STRICT: survives an app restart and expires by itself into COMPLETED", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 50, apps: [youtube], lockMode: STRICT }, env.deps));
    const restored = parseFocusState(JSON.parse(JSON.stringify(state)));
    expect(restored.current).toMatchObject({ lockMode: "STRICT", status: "ACTIVE" });
    env.advance(20 * 60_000);
    expect(reconcileFocus(restored, env.deps)).toMatchObject({ action: "none", state: { current: { status: "ACTIVE", lockMode: "STRICT" } } });
    env.advance(30 * 60_000);
    const result = reconcileFocus(restored, env.deps);
    expect(result).toMatchObject({ action: "completed", state: { current: { status: "COMPLETED", completedAt: new Date(T0 + 50 * 60_000).toISOString() } } });
    expect(env.deps.adapter.getStatus().active).toBe(false);
    expect(canStopFocus(restored.current!, T0 + 50 * 60_000)).toBe(true);
  });

  it("STRICT: the recovered session keeps its lock when JS storage was lost", () => {
    const env = fakeNative({ now: T0 });
    started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 50, apps: [youtube], lockMode: STRICT }, env.deps));
    const result = reconcileFocus(EMPTY_FOCUS_STATE, env.deps);
    expect(result.action).toBe("recovered");
    expect(result.state.current).toMatchObject({ lockMode: "STRICT", dayId: "day-1", dayTitle: "알고리즘 2문제", blockedApps: [youtube], durationMinutes: 50 });
  });

  it("describes STRICT for the confirmation and the running screen", () => {
    const end = new Date(2026, 8, 18, 16, 20).getTime();
    expect(strictConfirmation(50, end)).toEqual({
      title: "50분 동안 집중 잠금을 시작할까요?",
      message: "오후 4:20까지 DayFlow에서 이 집중 모드를 종료할 수 없어요.\n선택한 앱과 집중 시간도 변경할 수 없습니다.",
      confirm: "50분 동안 잠그기",
    });
    expect(formatKoreanClockTime(new Date(2026, 8, 18, 0, 5).getTime())).toBe("오전 12:05");
    expect(runningTitle({ lockMode: "STRICT" })).toBe("🔒 강제 집중 중");
    expect(runningTitle({ lockMode: "FLEXIBLE" })).toBe("집중 중");
  });
});

describe("Focus reconcile", () => {
  it("restores a running session after the app restarts (stored JSON, native still active)", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, env.deps));
    const restored = parseFocusState(JSON.parse(JSON.stringify(state)));
    expect(restored).toEqual(state);
    env.advance(10 * 60_000);
    const result = reconcileFocus(restored, env.deps);
    expect(result.action).toBe("none");
    expect(result.state.current).toMatchObject({ status: "ACTIVE", dayTitle: "알고리즘 2문제" });
  });

  it("completes a session whose time ran out while the app was closed, at its end time", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, env.deps));
    env.advance(40 * 60_000);
    const result = reconcileFocus(state, env.deps);
    expect(result.action).toBe("completed");
    expect(result.state.current).toMatchObject({ status: "COMPLETED", completedAt: new Date(T0 + 25 * 60_000).toISOString() });
    expect(needsEndPrompt(result.state.current)).toBe(true);
  });

  it("cancels the session when native blocking was stopped outside the Focus screen", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, env.deps));
    env.stopOutside();
    expect(reconcileFocus(state, env.deps)).toMatchObject({ action: "cancelled", state: { current: { status: "CANCELLED" } } });
  });

  it("a FLEXIBLE Focus ended on the Android block screen becomes CANCELLED when DayFlow opens", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 50, apps: [youtube], lockMode: FLEX }, env.deps));
    env.advance(10 * 60_000);
    // FocusBlockActivity "집중 종료" → FocusPolicy.stop in native, with DayFlow's JS not running.
    env.stopOutside();
    const restored = parseFocusState(JSON.parse(JSON.stringify(state)));
    expect(reconcileFocus(restored, env.deps)).toMatchObject({
      action: "cancelled",
      state: { current: { status: "CANCELLED", completedAt: new Date(T0 + 10 * 60_000).toISOString() } },
    });
  });

  it("recovers a native debug Focus that has no metadata", () => {
    const env = fakeNative({ now: T0 });
    env.startOutside(30, [youtube.id]);
    const result = reconcileFocus(EMPTY_FOCUS_STATE, env.deps);
    expect(result.action).toBe("recovered");
    expect(result.state.current).toMatchObject({ status: "ACTIVE", dayId: null, lockMode: "FLEXIBLE", blockingEngaged: true, blockedApps: [{ id: youtube.id, label: youtube.id }], durationMinutes: 30 });
  });

  it("stops native blocking again when an already ended session is still blocking", () => {
    const env = fakeNative({ now: T0 });
    let state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, env.deps));
    state = { ...state, current: { ...state.current!, status: "CANCELLED", completedAt: new Date(T0).toISOString() } };
    expect(reconcileFocusSession(state, env.deps.adapter.getStatus(), T0 + 60_000, () => "x").action).toBe("stop-native");
    const result = reconcileFocus(state, env.deps);
    expect(result.state).toBe(state);
    expect(env.calls.at(-1)).toBe("stop");
    expect(env.deps.adapter.getStatus().active).toBe(false);
  });

  it("keeps running as a timer when the permission is turned off, and says so", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, env.deps));
    env.setPermission("required");
    const result = reconcileFocus(state, env.deps);
    expect(result.state.current?.status).toBe("ACTIVE");
    expect(runningPermissionNotice(result.state.current!, env.deps.adapter.getPermission())).toContain("앱 차단 권한이 꺼졌어요");
    expect(runningPermissionNotice(result.state.current!, { state: "granted" })).toBeNull();
  });

  it("does not crash when native status cannot be read", () => {
    const env = fakeNative({ now: T0 });
    const state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, env.deps));
    const unreadable: FocusDeps = {
      ...env.deps,
      adapter: {
        ...env.deps.adapter,
        getStatus: () => {
          throw new Error("module missing");
        },
      },
    };
    expect(reconcileFocus(state, unreadable)).toMatchObject({ action: "none", state: { current: { status: "ACTIVE" } } });
  });

  it("records the Day answer once and moves the ended session to history on the next start", () => {
    const env = fakeNative({ now: T0 });
    let state = started(startFocus(EMPTY_FOCUS_STATE, { day, durationMinutes: 25, apps: [youtube], lockMode: FLEX }, env.deps));
    env.advance(25 * 60_000);
    state = reconcileFocus(state, env.deps).state;
    state = { ...state, current: acknowledgeEnd(state.current!, "DONE") };
    expect(state.current).toMatchObject({ status: "COMPLETED", dayOutcome: "DONE", endAcknowledged: true });
    expect(needsEndPrompt(state.current)).toBe(false);
    const next = started(startFocus(state, { day: null, durationMinutes: 25, apps: [], lockMode: FLEX }, env.deps));
    expect(next.history.map((entry) => [entry.dayId, entry.dayOutcome])).toEqual([["day-1", "DONE"]]);
    expect(next.current?.dayId).toBeNull();
  });

  it("reads broken or older stored data safely", () => {
    expect(parseFocusState("broken")).toEqual(EMPTY_FOCUS_STATE);
    expect(parseFocusState({ current: { id: "x" }, history: [null, 3] })).toEqual(EMPTY_FOCUS_STATE);
    const older = { id: "s", startedAt: new Date(T0).toISOString(), endsAt: new Date(T0 + 60_000).toISOString(), durationMinutes: 1, status: "COMPLETED" };
    expect(parseFocusState({ current: older, history: [] }).current).toMatchObject({ lockMode: "FLEXIBLE", origin: "MANUAL" });
  });
});

describe("App selection basics", () => {
  const installed: SelectableApp[] = [
    { id: youtube.id, label: "YouTube", iconUri: null, isSystemApp: false, osCategory: "VIDEO" },
    { id: instagram.id, label: "Instagram", iconUri: null, isSystemApp: false, osCategory: "UNDEFINED" },
    { id: "com.sec.android.app.clockpackage", label: "시계", iconUri: null, isSystemApp: true, osCategory: null },
  ];

  it("keeps the saved selection for the next Focus, per platform", () => {
    const stored = JSON.parse(JSON.stringify({ platform: "android", apps: [youtube, youtube, { ...instagram, category: "SOCIAL" }] }));
    expect(parseAppSelection(stored, "android").apps).toEqual([youtube, { ...instagram, category: "SOCIAL" }]);
    // An iOS selection (opaque tokens) is never read as Android package names, and vice versa.
    expect(parseAppSelection(stored, "ios").apps).toEqual([]);
    expect(parseAppSelection("broken", "android")).toEqual({ platform: "android", apps: [] });
  });

  it("drops uninstalled apps and refreshes names and categories from the installed list", () => {
    const selection = { apps: [{ id: youtube.id, label: "old name" }, { id: "com.removed.app", label: "Removed" }] };
    expect(selectionForInstalledApps(selection, installed)).toEqual([{ ...youtube, category: "ENTERTAINMENT" }]);
  });

  it("searches by app name (case-insensitive) and toggles several apps", () => {
    expect(searchApps(installed, "you tube").map((app) => app.id)).toEqual([youtube.id]);
    expect(searchApps(installed, "INSTAGRAM").map((app) => app.id)).toEqual([instagram.id]);
    expect(searchApps(installed, "clockpackage")).toEqual([]);
    expect(searchApps(installed, "  ")).toHaveLength(3);
    const selected = toggleApp(toggleApp([], installed[0]!), installed[1]!);
    expect(selected.map((app) => app.id)).toEqual([youtube.id, instagram.id]);
    expect(toggleApp(selected, installed[0]!).map((app) => app.id)).toEqual([instagram.id]);
    expect(selectionSummary([])).toBe("차단 앱 없음");
  });
});

describe("Focus and Days", () => {
  it("offers today's unfinished Days plus the Day Focus was opened from", () => {
    const days = [
      dayFixture({ id: "a", title: "오늘 할 일", plannedDate: "2026-09-18" }),
      dayFixture({ id: "b", title: "완료", plannedDate: "2026-09-18", status: "DONE" }),
      dayFixture({ id: "c", title: "다른 날", plannedDate: "2026-09-20" }),
    ];
    expect(focusDayCandidates(days, "2026-09-18", null).map((entry) => entry.id)).toEqual(["a"]);
    expect(focusDayCandidates(days, "2026-09-18", "c").map((entry) => entry.id)).toEqual(["c", "a"]);
    expect(canFocusOnDay({ status: "DONE" })).toBe(false);
    expect(canFocusOnDay({ status: "SKIPPED" })).toBe(false);
    expect(canFocusOnDay({ status: "IN_PROGRESS" })).toBe(true);
  });

  it("formats the countdown", () => {
    expect(formatCountdown(24 * 60 + 5)).toBe("24:05");
    expect(formatCountdown(3723)).toBe("1:02:03");
    expect(formatCountdown(-3)).toBe("00:00");
  });
});
