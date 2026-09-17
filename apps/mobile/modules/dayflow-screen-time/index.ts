import { requireOptionalNativeModule } from "expo";

/**
 * iOS Screen Time blocking (FamilyControls / ManagedSettings / DeviceActivity), POC. Present only in an iOS development
 * build; null elsewhere. Product code uses it through src/features/focus/ios-blocking-adapter.ts; app/dev/focus.tsx
 * calls it directly for native verification.
 *
 * Apps and categories are Apple's opaque tokens kept natively; JS only ever sees counts.
 */
export type ScreenTimeAuthorization = "notDetermined" | "denied" | "approved" | "unavailable";

export interface ScreenTimeSelectionCounts {
  applicationCount: number;
  categoryCount: number;
}

export interface ScreenTimeStatus extends ScreenTimeSelectionCounts {
  implemented: boolean;
  authorization: ScreenTimeAuthorization;
  active: boolean;
  /** Epoch ms, only while active. */
  endsAt?: number;
  startedAt?: number;
  lockMode?: "FLEXIBLE" | "STRICT";
  origin?: "MANUAL" | "ASK" | "AUTO";
  sessionId?: string;
  dayId?: string;
  dayTitle?: string;
  /** The session shields apps (false: timer-only). */
  shielded?: boolean;
  selectionLabel?: string;
  /** "scheduled", or why the DeviceActivity auto-end schedule could not be registered. */
  autoEnd?: string;
  /** What DayFlow's ManagedSettingsStore holds right now (native truth). */
  shieldedApplicationCount: number;
  shieldHasCategories: boolean;
}

export interface ScreenTimeStartRequest {
  sessionId?: string;
  /** Epoch ms; wins over durationMinutes. */
  endsAt?: number;
  durationMinutes?: number;
  lockMode?: "FLEXIBLE" | "STRICT";
  dayId?: string | null;
  dayTitle?: string | null;
  origin?: "MANUAL" | "ASK" | "AUTO";
  /** false: timer only, nothing shielded. */
  shield?: boolean;
  selectionLabel?: string;
}

interface DayflowScreenTimeNativeModule {
  getStatus(): ScreenTimeStatus;
  requestAuthorization(): Promise<{ authorization: ScreenTimeAuthorization; error?: string }>;
  presentActivityPicker(): Promise<ScreenTimeSelectionCounts | null>;
  getSelection(): ScreenTimeSelectionCounts;
  clearSelection(): ScreenTimeSelectionCounts;
  startBlocking(request: ScreenTimeStartRequest): ScreenTimeStatus;
  stopBlocking(): ScreenTimeStatus;
}

export const screenTimeModule = requireOptionalNativeModule<DayflowScreenTimeNativeModule>("DayflowScreenTime");
