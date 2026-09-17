import { screenTimeModule } from "../../../modules/dayflow-screen-time";
import { unsupportedBlockingAdapter, type FocusBlockingAdapter } from "./blocking-adapter";

/**
 * iOS: Screen Time (FamilyControls / ManagedSettings / DeviceActivity) is only a native skeleton today and
 * reports `implemented: false`, so Focus is a timer on iOS. When it is implemented, this adapter uses
 * selectionMode "system-picker": the app ids are opaque selection tokens, never bundle ids. Day schedule automation
 * maps to its `scheduler`: DeviceActivitySchedule per FocusScheduleEntry (intervalDidStart applies the shield for
 * AUTO, a local notification for NOTIFY_ONLY / ASK), and STRICT to not offering "end" before intervalDidEnd.
 */
export const iosBlockingAdapter: FocusBlockingAdapter = screenTimeModule?.getStatus().implemented
  ? {
      ...unsupportedBlockingAdapter,
      platform: "ios",
      // TODO(Screen Time): wire requestAuthorization / presentAppPicker / startBlocking / stopBlocking.
    }
  : unsupportedBlockingAdapter;
