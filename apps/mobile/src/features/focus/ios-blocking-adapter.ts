import { screenTimeModule } from "../../../modules/dayflow-screen-time";
import { NO_BLOCKING, unsupportedBlockingAdapter, unsupportedScheduler, type FocusBlockingAdapter } from "./blocking-adapter";
import { screenTimePermission, screenTimeSelectionLabel, screenTimeSelectionRefs, screenTimeSnapshot } from "./ios-screen-time";

/**
 * iOS: Screen Time (FamilyControls authorization, FamilyActivityPicker, ManagedSettings shield, DeviceActivity auto
 * end) through modules/dayflow-screen-time — a POC being verified on a real iPhone. selectionMode "system-picker": the
 * app ids are opaque tokens, never bundle ids. Day schedule automation (the scheduler) is not implemented on iOS yet.
 * Without the native module (Expo Go, simulator builds without it) Focus stays a timer.
 */
const native = screenTimeModule;

export const iosBlockingAdapter: FocusBlockingAdapter = !native
  ? unsupportedBlockingAdapter
  : {
      platform: "ios",
      available: true,
      selectionMode: "system-picker",
      getPermission: () => screenTimePermission(native.getStatus().authorization),
      // iOS shows its own Screen Time dialog; there is no settings page to open for this.
      openPermissionSettings: async () => {
        await native.requestAuthorization();
      },
      getSelectableApps: async () => [],
      presentSystemPicker: async () => {
        const counts = await native.presentActivityPicker();
        return counts ? screenTimeSelectionRefs(counts) : null;
      },
      startBlocking: (request) =>
        screenTimeSnapshot(
          native.startBlocking({
            sessionId: request.sessionId,
            endsAt: request.endsAt,
            lockMode: request.lockMode,
            dayId: request.dayId,
            dayTitle: request.dayTitle,
            origin: request.origin,
            shield: request.apps.length > 0,
            selectionLabel: screenTimeSelectionLabel(native.getSelection()),
          }),
        ),
      stopBlocking: () => screenTimeSnapshot(native.stopBlocking()),
      getStatus: () => {
        try {
          return screenTimeSnapshot(native.getStatus());
        } catch {
          return NO_BLOCKING;
        }
      },
      scheduler: unsupportedScheduler,
    };
