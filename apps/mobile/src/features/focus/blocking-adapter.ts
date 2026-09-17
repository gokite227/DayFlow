import type { BlockedAppRef, BlockingSnapshot, FocusLockMode, FocusOrigin, FocusPlatform } from "./focus-model";

/**
 * Platform-neutral app blocking used by the Focus product code. Android (AccessibilityService) and iOS
 * (Screen Time, not implemented yet) sit behind this interface, so screens never deal with package names or
 * FamilyActivitySelection tokens directly.
 */
export type BlockingPermissionState =
  /** Blocking can be used. */
  | "granted"
  /** The user must allow it (Android: Accessibility service; iOS: Family Controls authorization). */
  | "required"
  /** No blocking on this platform/build: Focus works as a timer only. */
  | "unsupported";

export interface BlockingPermission {
  state: BlockingPermissionState;
}

export interface SelectableApp extends BlockedAppRef {
  /** data: URI of the app icon, or null. */
  iconUri: string | null;
  /** Preinstalled app; shown after the user's own apps. */
  isSystemApp: boolean;
  /** The platform's own category hint (Android ApplicationInfo.category name), or null. */
  osCategory: string | null;
}

/** A session start: native owns the end time and enforces STRICT (it refuses to stop early). */
export interface StartBlockingRequest {
  sessionId: string;
  apps: readonly BlockedAppRef[];
  /** Epoch ms. */
  endsAt: number;
  lockMode: FocusLockMode;
  dayId: string | null;
  dayTitle: string | null;
  origin: FocusOrigin;
}

/** A Day schedule the OS acts on at its start, even when DayFlow is closed. MANUAL Days are never sent. */
export interface FocusScheduleEntry {
  /** Stable per Day: "day:<dayId>". */
  id: string;
  dayId: string;
  title: string;
  /** Epoch ms. */
  startAt: number;
  endAt: number;
  trigger: "NOTIFY_ONLY" | "ASK" | "AUTO";
  /** Ignored for NOTIFY_ONLY (nothing is blocked). */
  lockMode: FocusLockMode;
  apps: readonly BlockedAppRef[];
}

export type FocusScheduleStatus = "SCHEDULED" | "NOTIFIED" | "ASKED" | "STARTED" | "DISMISSED" | "SKIPPED" | "MISSED";

export interface FocusScheduleState extends Omit<FocusScheduleEntry, "apps"> {
  appIds: string[];
  status: FocusScheduleStatus;
}

/** How precisely the OS starts a scheduled Focus. */
export type ScheduleTiming = "exact" | "inexact" | "unsupported";

export interface FocusScheduler {
  /** OS-level scheduling exists in this build (Android today; iOS DeviceActivity later). */
  available: boolean;
  /** Replaces every scheduled Focus with `entries` (same id → replaced, missing id → cancelled). */
  sync(entries: readonly FocusScheduleEntry[]): FocusScheduleState[];
  list(): FocusScheduleState[];
  /** The in-app "집중 시작" of an ASK schedule; the OS starts the Focus until the schedule ends. */
  accept(id: string): BlockingSnapshot;
  /** "나중에": nothing starts and the prompt is not offered again. */
  dismiss(id: string): void;
  timing(): { timing: ScheduleTiming; userControlled: boolean };
  openTimingSettings(): Promise<void>;
}

export interface FocusBlockingAdapter {
  platform: FocusPlatform | null;
  /** Native blocking exists in this build. */
  available: boolean;
  /**
   * How apps are chosen: "list" = DayFlow shows installed apps (Android); "system-picker" = the OS shows its own
   * picker and returns an opaque selection (iOS FamilyActivityPicker); "none" = no app selection.
   */
  selectionMode: "list" | "system-picker" | "none";
  getPermission(): BlockingPermission;
  openPermissionSettings(): Promise<void>;
  getSelectableApps(): Promise<SelectableApp[]>;
  /**
   * "system-picker" only (iOS): shows the OS picker and returns the new selection as opaque refs, or null when
   * cancelled. The picked tokens stay native.
   */
  presentSystemPicker?(): Promise<BlockedAppRef[] | null>;
  /** Stores the block list and starts blocking until `endsAt`; returns the native state. */
  startBlocking(request: StartBlockingRequest): BlockingSnapshot;
  /** Throws for a STRICT session before its end. */
  stopBlocking(): BlockingSnapshot;
  getStatus(): BlockingSnapshot;
  scheduler: FocusScheduler;
}

export const NO_BLOCKING: BlockingSnapshot = { available: false, active: false, endsAt: null, blockedAppIds: [] };

/** No OS scheduling: Day automation is off (the Focus screen still works). */
export const unsupportedScheduler: FocusScheduler = {
  available: false,
  sync: () => [],
  list: () => [],
  accept: () => NO_BLOCKING,
  dismiss: () => undefined,
  timing: () => ({ timing: "unsupported", userControlled: false }),
  openTimingSettings: async () => undefined,
};

/** A build without native blocking (Expo Go, web, iOS today): Focus is a timer. */
export const unsupportedBlockingAdapter: FocusBlockingAdapter = {
  platform: null,
  available: false,
  selectionMode: "none",
  getPermission: () => ({ state: "unsupported" }),
  openPermissionSettings: async () => undefined,
  getSelectableApps: async () => [],
  startBlocking: () => NO_BLOCKING,
  stopBlocking: () => NO_BLOCKING,
  getStatus: () => NO_BLOCKING,
  scheduler: unsupportedScheduler,
};
