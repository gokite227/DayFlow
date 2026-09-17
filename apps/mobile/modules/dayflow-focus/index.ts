import { requireOptionalNativeModule } from "expo";

/**
 * Android app blocking (AccessibilityService) and Day schedule automation (AlarmManager). Not available on iOS or
 * in Expo Go. Product code uses it through src/features/focus/android-blocking-adapter.ts; app/dev/focus.tsx calls
 * it directly for native debugging.
 */
export interface FocusPermissionStatus {
  /** The DayFlow Focus service is switched on in Android Accessibility settings. */
  accessibilityServiceEnabled: boolean;
  /** The service is actually bound and receiving events in this app process. */
  serviceConnected: boolean;
}

export type NativeLockMode = "FLEXIBLE" | "STRICT";
export type NativeOrigin = "MANUAL" | "ASK" | "AUTO";

export interface FocusStatus {
  active: boolean;
  /** Epoch milliseconds, only while active. */
  endsAt: number | null;
  remainingSeconds: number;
  blockedPackages: string[];
  lockMode: NativeLockMode;
  /** Product metadata of the session (null for a debug start). */
  sessionId: string | null;
  dayId: string | null;
  dayTitle: string | null;
  origin: NativeOrigin;
  startedAt: number | null;
  appLabels: Record<string, string>;
  lastForegroundPackage: string | null;
  lastBlockedPackage: string | null;
}

/** A launcher-visible app that may be blocked (DayFlow, launchers, Settings, System UI and phone are never listed). */
export interface InstalledApp {
  packageName: string;
  label: string;
  /** Preinstalled and never updated (Clock, Calculator, …); listed after the user's own apps. */
  isSystemApp: boolean;
  /** ApplicationInfo.category as a name: GAME, AUDIO, VIDEO, IMAGE, SOCIAL, NEWS, MAPS, PRODUCTIVITY, ACCESSIBILITY or UNDEFINED. */
  osCategory: string;
  /** PNG, base64 without the data: prefix; null when the icon could not be drawn. */
  iconBase64: string | null;
}

export interface StartSessionRequest {
  sessionId: string;
  packageNames: string[];
  appLabels: Record<string, string>;
  /** Epoch milliseconds. */
  endsAt: number;
  lockMode: NativeLockMode;
  dayId: string | null;
  dayTitle: string | null;
  origin: NativeOrigin;
}

export type NativeTrigger = "NOTIFY_ONLY" | "ASK" | "AUTO";
export type NativeScheduleStatus = "SCHEDULED" | "NOTIFIED" | "ASKED" | "STARTED" | "DISMISSED" | "SKIPPED" | "MISSED";

export interface NativeScheduleEntry {
  /** "day:<dayId>" */
  id: string;
  dayId: string;
  title: string;
  startAt: number;
  endAt: number;
  trigger: NativeTrigger;
  lockMode: NativeLockMode;
  packageNames: string[];
  appLabels: Record<string, string>;
}

export interface NativeScheduleState extends Omit<NativeScheduleEntry, "appLabels"> {
  status: NativeScheduleStatus;
}

export interface ExactAlarmStatus {
  /** Android 12+: the user controls "알람 및 리마인더". */
  userControlled: boolean;
  exact: boolean;
}

interface DayflowFocusNativeModule {
  getPermissionStatus(): FocusPermissionStatus;
  openAccessibilitySettings(): void;
  getInstalledApps(): Promise<InstalledApp[]>;
  setBlockedPackages(packageNames: string[]): FocusStatus;
  startFocus(durationMinutes: number): FocusStatus;
  startSession(request: StartSessionRequest): FocusStatus;
  stopFocus(): FocusStatus;
  getFocusStatus(): FocusStatus;
  syncFocusSchedules(entries: NativeScheduleEntry[]): NativeScheduleState[];
  getFocusSchedules(): NativeScheduleState[];
  acceptScheduledFocus(id: string): FocusStatus;
  dismissScheduledFocus(id: string): void;
  getExactAlarmStatus(): ExactAlarmStatus;
  openExactAlarmSettings(): void;
  rearmFocusSchedules(): void;
}

const native = requireOptionalNativeModule<DayflowFocusNativeModule>("DayflowFocus");

export const isFocusBlockingAvailable = native !== null;

function nativeModule(): DayflowFocusNativeModule {
  if (!native) throw new Error("Focus 차단은 Android development build에서만 쓸 수 있어요.");
  return native;
}

export const getPermissionStatus = () => nativeModule().getPermissionStatus();
export const openAccessibilitySettings = () => nativeModule().openAccessibilitySettings();
export const getInstalledApps = () => nativeModule().getInstalledApps();
export const setBlockedPackages = (packageNames: string[]) => nativeModule().setBlockedPackages(packageNames);
export const startFocus = (durationMinutes: number) => nativeModule().startFocus(durationMinutes);
export const startSession = (request: StartSessionRequest) => nativeModule().startSession(request);
export const stopFocus = () => nativeModule().stopFocus();
export const getFocusStatus = () => nativeModule().getFocusStatus();
export const syncFocusSchedules = (entries: NativeScheduleEntry[]) => nativeModule().syncFocusSchedules(entries);
export const getFocusSchedules = () => nativeModule().getFocusSchedules();
export const acceptScheduledFocus = (id: string) => nativeModule().acceptScheduledFocus(id);
export const dismissScheduledFocus = (id: string) => nativeModule().dismissScheduledFocus(id);
export const getExactAlarmStatus = () => nativeModule().getExactAlarmStatus();
export const openExactAlarmSettings = () => nativeModule().openExactAlarmSettings();
export const rearmFocusSchedules = () => nativeModule().rearmFocusSchedules();
