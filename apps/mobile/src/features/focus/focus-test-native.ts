import type { FocusBlockingAdapter, FocusScheduleEntry, FocusScheduleState } from "./blocking-adapter";
import type { BlockingSnapshot, FocusLockMode, FocusOrigin } from "./focus-model";
import type { FocusDeps } from "./focus-service";

/**
 * Test double of the Android native layer (FocusStore + FocusScheduleStore): one running session that expires at
 * its end, refuses to stop or be replaced while STRICT, and a schedule registry keyed by a stable id whose alarms
 * can be fired by the test. It mirrors FocusPolicy / FocusSchedulePolicy so the JS flows can be tested end to end.
 */
export function fakeNative(options: { now: number; permission?: "granted" | "required"; available?: boolean }) {
  let clock = options.now;
  let permission = options.permission ?? "granted";
  let ids = 0;
  const calls: string[] = [];
  let session: {
    active: boolean;
    endsAt: number;
    packages: string[];
    labels: Record<string, string>;
    lockMode: FocusLockMode;
    id: string | null;
    dayId: string | null;
    dayTitle: string | null;
    origin: FocusOrigin;
    startedAt: number | null;
  } = { active: false, endsAt: 0, packages: [], labels: {}, lockMode: "FLEXIBLE", id: null, dayId: null, dayTitle: null, origin: "MANUAL", startedAt: null };
  const schedules = new Map<string, FocusScheduleState & { labels: Record<string, string> }>();
  /** Armed alarms by schedule id; arming the same id replaces its alarm (like a PendingIntent). */
  const alarms = new Map<string, number>();

  const running = () => session.active && clock < session.endsAt;
  const locked = () => running() && session.lockMode === "STRICT";
  const read = (): BlockingSnapshot => ({
    available: true,
    active: running(),
    endsAt: running() ? session.endsAt : null,
    blockedAppIds: [...session.packages],
    session: {
      id: session.id,
      dayId: session.dayId,
      dayTitle: session.dayTitle,
      lockMode: session.lockMode,
      origin: session.origin,
      startedAt: session.startedAt,
      appLabels: session.labels,
    },
  });
  const startFromSchedule = (entry: FocusScheduleState & { labels: Record<string, string> }) => {
    session = {
      active: true,
      endsAt: entry.endAt,
      packages: entry.appIds,
      labels: entry.labels,
      lockMode: entry.lockMode,
      id: `native-${++ids}`,
      dayId: entry.dayId,
      dayTitle: entry.title,
      origin: entry.trigger === "AUTO" ? "AUTO" : "ASK",
      startedAt: clock,
    };
    entry.status = "STARTED";
  };
  const publicState = (entry: FocusScheduleState): FocusScheduleState => ({
    id: entry.id,
    dayId: entry.dayId,
    title: entry.title,
    startAt: entry.startAt,
    endAt: entry.endAt,
    trigger: entry.trigger,
    lockMode: entry.lockMode,
    appIds: entry.appIds,
    status: entry.status,
  });
  const fingerprint = (entry: Pick<FocusScheduleState, "startAt" | "endAt" | "trigger" | "lockMode" | "title" | "appIds">) =>
    JSON.stringify([entry.startAt, entry.endAt, entry.trigger, entry.lockMode, entry.title, [...entry.appIds].sort()]);

  const adapter: FocusBlockingAdapter = {
    platform: "android",
    available: true,
    selectionMode: "list",
    getPermission: () => ({ state: permission }),
    openPermissionSettings: async () => undefined,
    getSelectableApps: async () => [],
    startBlocking: (request) => {
      calls.push(`start:${request.apps.map((app) => app.id).join(",")}:${request.lockMode}`);
      if (locked()) throw new Error("ERR_FOCUS_LOCKED");
      session = {
        active: true,
        endsAt: request.endsAt,
        packages: request.apps.map((app) => app.id),
        labels: Object.fromEntries(request.apps.map((app) => [app.id, app.label])),
        lockMode: request.lockMode,
        id: request.sessionId,
        dayId: request.dayId,
        dayTitle: request.dayTitle,
        origin: request.origin,
        startedAt: clock,
      };
      return read();
    },
    stopBlocking: () => {
      calls.push("stop");
      if (locked()) throw new Error("ERR_FOCUS_LOCKED");
      session = { ...session, active: false, endsAt: 0 };
      return read();
    },
    getStatus: read,
    scheduler: {
      available: true,
      sync: (entries: readonly FocusScheduleEntry[]) => {
        calls.push(`sync:${entries.length}`);
        const wanted = new Map(entries.filter((entry) => entry.endAt > clock).map((entry) => [entry.id, entry]));
        for (const id of [...schedules.keys()]) {
          if (!wanted.has(id)) {
            schedules.delete(id);
            alarms.delete(id);
          }
        }
        for (const entry of wanted.values()) {
          const next = { ...entry, appIds: entry.apps.map((app) => app.id), labels: Object.fromEntries(entry.apps.map((app) => [app.id, app.label])) };
          const existing = schedules.get(entry.id);
          if (existing && fingerprint(existing) === fingerprint(next)) continue;
          schedules.set(entry.id, { ...next, status: "SCHEDULED" });
          alarms.set(entry.id, entry.startAt);
        }
        return [...schedules.values()].map(publicState);
      },
      list: () => [...schedules.values()].map(publicState),
      accept: (id) => {
        const entry = schedules.get(id);
        if (entry && entry.trigger === "ASK" && (entry.status === "ASKED" || entry.status === "SCHEDULED") && clock < entry.endAt && !running()) {
          startFromSchedule(entry);
        }
        return read();
      },
      dismiss: (id) => {
        const entry = schedules.get(id);
        if (entry && (entry.status === "ASKED" || entry.status === "SCHEDULED")) entry.status = "DISMISSED";
        alarms.delete(id);
      },
      timing: () => ({ timing: "inexact", userControlled: true }),
      openTimingSettings: async () => undefined,
    },
  };

  const deps: FocusDeps = {
    adapter: options.available === false ? { ...adapter, available: false } : adapter,
    now: () => clock,
    newId: () => `focus-${++ids}`,
  };

  return {
    deps,
    calls,
    alarms,
    notifications: [] as string[],
    advance(ms: number) {
      clock += ms;
    },
    setPermission(next: "granted" | "required") {
      permission = next;
    },
    stopOutside() {
      session = { ...session, active: false, endsAt: 0 };
    },
    startOutside(minutes: number, appIds: string[]) {
      session = { ...session, active: true, endsAt: clock + minutes * 60_000, packages: appIds, id: null, dayId: null, dayTitle: null, lockMode: "FLEXIBLE", origin: "MANUAL", startedAt: null };
    },
    /** The OS alarm of a schedule fires (FocusSchedulePolicy.onStart). */
    fireAlarm(id: string) {
      const entry = schedules.get(id);
      if (!entry || entry.status !== "SCHEDULED" || clock < entry.startAt) return;
      alarms.delete(id);
      if (clock >= entry.endAt) {
        entry.status = "MISSED";
        return;
      }
      if (entry.trigger === "NOTIFY_ONLY") {
        entry.status = "NOTIFIED";
        this.notifications.push(`${entry.title} 시작할 시간이에요`);
      } else if (entry.trigger === "ASK") {
        entry.status = "ASKED";
        this.notifications.push(`${entry.title}을(를) 시작할까요?`);
      } else if (running()) {
        entry.status = "SKIPPED";
      } else {
        startFromSchedule(entry);
        this.notifications.push(`${entry.title} ${entry.lockMode === "STRICT" ? "강제 집중이" : "집중 모드가"} 시작됐어요`);
      }
    },
  };
}
