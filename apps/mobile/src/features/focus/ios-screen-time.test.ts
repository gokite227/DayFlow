import { describe, expect, it } from "vitest";
import { selectionSummary } from "./app-selection";
import { unsupportedScheduler, type FocusBlockingAdapter } from "./blocking-adapter";
import { EMPTY_FOCUS_STATE, canStopFocus } from "./focus-model";
import { reconcileFocus, startFocus, stopFocus, type FocusDeps } from "./focus-service";
import {
  IOS_SELECTION_ID,
  screenTimePermission,
  screenTimeSelectionLabel,
  screenTimeSelectionRefs,
  screenTimeSnapshot,
  type ScreenTimeStatusLike,
} from "./ios-screen-time";

const NOW = Date.parse("2026-09-18T10:00:00+09:00");
const idle: ScreenTimeStatusLike = { authorization: "approved", active: false, applicationCount: 2, categoryCount: 1 };

/**
 * Stand-in for the native Screen Time module (the real one only runs on an iPhone): the shield and the session live
 * "natively" and expire at endsAt; JS only sees counts and the snapshot.
 */
function fakeScreenTime() {
  let clock = NOW;
  let status: ScreenTimeStatusLike = { ...idle };
  const read = () => {
    if (status.active && status.endsAt !== undefined && clock >= status.endsAt) status = { ...idle, authorization: status.authorization };
    return status;
  };
  const adapter: FocusBlockingAdapter = {
    platform: "ios",
    available: true,
    selectionMode: "system-picker",
    getPermission: () => screenTimePermission(read().authorization),
    openPermissionSettings: async () => undefined,
    getSelectableApps: async () => [],
    presentSystemPicker: async () => screenTimeSelectionRefs(status),
    startBlocking: (request) => {
      if (read().active && status.lockMode === "STRICT") throw new Error("ERR_FOCUS_LOCKED");
      status = {
        ...status,
        active: true,
        startedAt: clock,
        endsAt: request.endsAt,
        lockMode: request.lockMode,
        sessionId: request.sessionId,
        dayId: request.dayId ?? undefined,
        dayTitle: request.dayTitle ?? undefined,
        origin: request.origin,
        shielded: request.apps.length > 0,
      };
      return screenTimeSnapshot(read());
    },
    stopBlocking: () => {
      if (read().active && status.lockMode === "STRICT") throw new Error("ERR_FOCUS_LOCKED");
      status = { ...idle, authorization: status.authorization };
      return screenTimeSnapshot(read());
    },
    getStatus: () => screenTimeSnapshot(read()),
    scheduler: unsupportedScheduler,
  };
  let ids = 0;
  const deps: FocusDeps = { adapter, now: () => clock, newId: () => `s-${++ids}` };
  return {
    deps,
    advance: (ms: number) => {
      clock += ms;
    },
    setAuthorization: (value: ScreenTimeStatusLike["authorization"]) => {
      status = { ...status, authorization: value };
    },
  };
}

describe("iOS Screen Time mapping", () => {
  it("keeps the selection opaque: one ref with counts, never bundle ids", () => {
    expect(screenTimeSelectionRefs({ applicationCount: 2, categoryCount: 1 })).toEqual([{ id: IOS_SELECTION_ID, label: "앱 2개 · 카테고리 1개" }]);
    expect(screenTimeSelectionRefs({ applicationCount: 0, categoryCount: 0 })).toEqual([]);
    expect(screenTimeSelectionLabel({ applicationCount: 0, categoryCount: 3 })).toBe("카테고리 3개");
    expect(selectionSummary(screenTimeSelectionRefs({ applicationCount: 1, categoryCount: 0 }))).toBe("앱 1개");
  });

  it("maps authorization to the shared permission state", () => {
    expect(screenTimePermission("approved")).toEqual({ state: "granted" });
    for (const other of ["notDetermined", "denied", "unavailable"] as const) expect(screenTimePermission(other)).toEqual({ state: "required" });
  });

  it("maps the native status to the shared snapshot", () => {
    expect(screenTimeSnapshot(idle)).toEqual({ available: true, active: false, endsAt: null, blockedAppIds: [], session: null });
    const running = screenTimeSnapshot({ ...idle, active: true, endsAt: NOW + 300_000, startedAt: NOW, lockMode: "STRICT", shielded: true, sessionId: "s1", dayId: "d", dayTitle: "수학" });
    expect(running).toMatchObject({
      active: true,
      endsAt: NOW + 300_000,
      blockedAppIds: [IOS_SELECTION_ID],
      session: { id: "s1", lockMode: "STRICT", dayTitle: "수학", appLabels: { [IOS_SELECTION_ID]: "앱 2개 · 카테고리 1개" } },
    });
    expect(screenTimeSnapshot({ ...idle, active: true, endsAt: NOW + 1, shielded: false }).blockedAppIds).toEqual([]);
  });
});

describe("iOS Focus through the shared Focus service", () => {
  const apps = screenTimeSelectionRefs({ applicationCount: 2, categoryCount: 1 });

  it("FLEXIBLE: start shields, stop lifts it", () => {
    const env = fakeScreenTime();
    const started = startFocus(EMPTY_FOCUS_STATE, { day: null, durationMinutes: 5, apps, lockMode: "FLEXIBLE" }, env.deps);
    if (!started.ok) throw new Error(started.reason);
    expect(started.session).toMatchObject({ blockingEngaged: true, blockedApps: apps, endsAt: new Date(NOW + 300_000).toISOString() });
    expect(env.deps.adapter.getStatus()).toMatchObject({ active: true, blockedAppIds: [IOS_SELECTION_ID] });
    expect(stopFocus(started.state, env.deps)).toMatchObject({ locked: false, state: { current: { status: "CANCELLED" } } });
    expect(env.deps.adapter.getStatus().active).toBe(false);
  });

  it("STRICT: the product refuses to stop it and native would too; it ends by itself", () => {
    const env = fakeScreenTime();
    const started = startFocus(EMPTY_FOCUS_STATE, { day: null, durationMinutes: 5, apps, lockMode: "STRICT" }, env.deps);
    if (!started.ok) throw new Error(started.reason);
    expect(canStopFocus(started.session, NOW + 60_000)).toBe(false);
    expect(stopFocus(started.state, env.deps)).toMatchObject({ locked: true });
    expect(() => env.deps.adapter.stopBlocking()).toThrow("ERR_FOCUS_LOCKED");
    env.advance(300_000);
    expect(reconcileFocus(started.state, env.deps)).toMatchObject({ action: "completed", state: { current: { status: "COMPLETED" } } });
  });

  it("after DayFlow restarts, the native session is recovered with its lock", () => {
    const env = fakeScreenTime();
    const started = startFocus(EMPTY_FOCUS_STATE, { day: { id: "d", title: "수학" }, durationMinutes: 5, apps, lockMode: "STRICT" }, env.deps);
    if (!started.ok) throw new Error(started.reason);
    expect(reconcileFocus(EMPTY_FOCUS_STATE, env.deps)).toMatchObject({
      action: "recovered",
      state: { current: { status: "ACTIVE", lockMode: "STRICT", dayTitle: "수학", blockedApps: [{ id: IOS_SELECTION_ID, label: "앱 2개 · 카테고리 1개" }] } },
    });
  });

  it("without Screen Time authorization nothing starts (no crash)", () => {
    const env = fakeScreenTime();
    env.setAuthorization("denied");
    expect(startFocus(EMPTY_FOCUS_STATE, { day: null, durationMinutes: 5, apps, lockMode: "FLEXIBLE" }, env.deps)).toEqual({ ok: false, reason: "permission-required" });
  });
});
