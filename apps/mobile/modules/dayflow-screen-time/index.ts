import { requireOptionalNativeModule } from "expo";

/**
 * iOS Screen Time blocking (FamilyControls / ManagedSettings / DeviceActivity) — native SKELETON only.
 * `implemented` is false today: nothing is blocked on iOS. See ios/DayflowScreenTimeModule.swift.
 */
export type ScreenTimeAuthorization = "notDetermined" | "denied" | "approved" | "unsupported";

export interface ScreenTimeStatus {
  implemented: boolean;
  authorization: ScreenTimeAuthorization;
  active: boolean;
  /** Epoch ms while active (omitted otherwise). */
  endsAt?: number;
  /** Apps in the opaque FamilyActivitySelection (iOS never exposes bundle ids to the app). */
  selectedCount: number;
}

export interface ScreenTimeSelection {
  /** Serialized FamilyActivitySelection; only meaningful to the native module. */
  selection: string;
  count: number;
}

interface DayflowScreenTimeNativeModule {
  getStatus(): ScreenTimeStatus;
  requestAuthorization(): Promise<ScreenTimeAuthorization>;
  presentAppPicker(): Promise<ScreenTimeSelection | null>;
  startBlocking(selection: string | null, durationMinutes: number): Pick<ScreenTimeStatus, "implemented" | "active" | "endsAt">;
  stopBlocking(): Pick<ScreenTimeStatus, "implemented" | "active" | "endsAt">;
}

export const screenTimeModule = requireOptionalNativeModule<DayflowScreenTimeNativeModule>("DayflowScreenTime");
