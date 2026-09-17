import {
  acceptScheduledFocus,
  dismissScheduledFocus,
  getExactAlarmStatus,
  getFocusSchedules,
  getFocusStatus,
  getInstalledApps,
  getPermissionStatus,
  isFocusBlockingAvailable,
  openAccessibilitySettings,
  openExactAlarmSettings,
  rearmFocusSchedules,
  startSession,
  stopFocus,
  syncFocusSchedules,
  type FocusStatus,
  type NativeScheduleState,
} from "../../../modules/dayflow-focus";
import { NO_BLOCKING, unsupportedBlockingAdapter, type FocusBlockingAdapter, type FocusScheduleState } from "./blocking-adapter";
import type { BlockingSnapshot } from "./focus-model";

const snapshot = (status: FocusStatus): BlockingSnapshot => ({
  available: true,
  active: status.active,
  endsAt: status.endsAt,
  blockedAppIds: status.blockedPackages,
  session: {
    id: status.sessionId ?? null,
    dayId: status.dayId ?? null,
    dayTitle: status.dayTitle ?? null,
    lockMode: status.lockMode === "STRICT" ? "STRICT" : "FLEXIBLE",
    origin: status.origin === "ASK" || status.origin === "AUTO" ? status.origin : "MANUAL",
    startedAt: status.startedAt ?? null,
    appLabels: status.appLabels ?? {},
  },
});

const scheduleState = (entry: NativeScheduleState): FocusScheduleState => ({
  id: entry.id,
  dayId: entry.dayId,
  title: entry.title,
  startAt: entry.startAt,
  endAt: entry.endAt,
  trigger: entry.trigger,
  lockMode: entry.lockMode,
  appIds: entry.packageNames,
  status: entry.status,
});

/**
 * Android: the dayflow-focus module (AccessibilityService + FocusStore, AlarmManager + FocusScheduleStore). The
 * app id is the package name. Native keeps blocking — expiring it at endsAt and refusing to stop a STRICT session
 * early — and runs Day schedules even when DayFlow is not running.
 */
export const androidBlockingAdapter: FocusBlockingAdapter = !isFocusBlockingAvailable
  ? unsupportedBlockingAdapter
  : {
      platform: "android",
      available: true,
      selectionMode: "list",
      getPermission: () => ({ state: getPermissionStatus().accessibilityServiceEnabled ? "granted" : "required" }),
      openPermissionSettings: async () => openAccessibilitySettings(),
      getSelectableApps: async () =>
        (await getInstalledApps()).map((app) => ({
          id: app.packageName,
          label: app.label,
          isSystemApp: app.isSystemApp,
          osCategory: app.osCategory ?? null,
          iconUri: app.iconBase64 ? `data:image/png;base64,${app.iconBase64}` : null,
        })),
      startBlocking: (request) =>
        snapshot(
          startSession({
            sessionId: request.sessionId,
            packageNames: request.apps.map((app) => app.id),
            appLabels: Object.fromEntries(request.apps.map((app) => [app.id, app.label])),
            endsAt: request.endsAt,
            lockMode: request.lockMode,
            dayId: request.dayId,
            dayTitle: request.dayTitle,
            origin: request.origin,
          }),
        ),
      stopBlocking: () => snapshot(stopFocus()),
      getStatus: () => {
        try {
          return snapshot(getFocusStatus());
        } catch {
          return NO_BLOCKING;
        }
      },
      scheduler: {
        available: true,
        sync: (entries) =>
          syncFocusSchedules(
            entries.map((entry) => ({
              id: entry.id,
              dayId: entry.dayId,
              title: entry.title,
              startAt: entry.startAt,
              endAt: entry.endAt,
              trigger: entry.trigger,
              lockMode: entry.lockMode,
              packageNames: entry.apps.map((app) => app.id),
              appLabels: Object.fromEntries(entry.apps.map((app) => [app.id, app.label])),
            })),
          ).map(scheduleState),
        list: () => getFocusSchedules().map(scheduleState),
        accept: (id) => snapshot(acceptScheduledFocus(id)),
        dismiss: (id) => dismissScheduledFocus(id),
        timing: () => {
          const status = getExactAlarmStatus();
          return { timing: status.exact ? "exact" : "inexact", userControlled: status.userControlled };
        },
        openTimingSettings: async () => {
          openExactAlarmSettings();
          rearmFocusSchedules();
        },
      },
    };
