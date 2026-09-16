import { requireOptionalNativeModule } from "expo";

/** Android App Blocking POC (AccessibilityService). Not available on iOS or in Expo Go. */
export interface FocusPermissionStatus {
  /** The DayFlow Focus service is switched on in Android Accessibility settings. */
  accessibilityServiceEnabled: boolean;
  /** The service is actually bound and receiving events in this app process. */
  serviceConnected: boolean;
}

export interface FocusStatus {
  active: boolean;
  /** Epoch milliseconds, only while active. */
  endsAt: number | null;
  remainingSeconds: number;
  blockedPackages: string[];
  lastForegroundPackage: string | null;
  lastBlockedPackage: string | null;
}

interface DayflowFocusNativeModule {
  getPermissionStatus(): FocusPermissionStatus;
  openAccessibilitySettings(): void;
  setBlockedPackages(packageNames: string[]): FocusStatus;
  startFocus(durationMinutes: number): FocusStatus;
  stopFocus(): FocusStatus;
  getFocusStatus(): FocusStatus;
}

const native = requireOptionalNativeModule<DayflowFocusNativeModule>("DayflowFocus");

export const isFocusBlockingAvailable = native !== null;

function nativeModule(): DayflowFocusNativeModule {
  if (!native) throw new Error("Focus 차단은 Android development build에서만 쓸 수 있어요.");
  return native;
}

export const getPermissionStatus = () => nativeModule().getPermissionStatus();
export const openAccessibilitySettings = () => nativeModule().openAccessibilitySettings();
export const setBlockedPackages = (packageNames: string[]) => nativeModule().setBlockedPackages(packageNames);
export const startFocus = (durationMinutes: number) => nativeModule().startFocus(durationMinutes);
export const stopFocus = () => nativeModule().stopFocus();
export const getFocusStatus = () => nativeModule().getFocusStatus();
