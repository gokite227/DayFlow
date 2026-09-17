import type { BlockingPermission } from "./blocking-adapter";
import type { BlockedAppRef, BlockingSnapshot } from "./focus-model";

/**
 * Pure mapping between the iOS Screen Time module and the platform-neutral Focus model.
 *
 * iOS never exposes bundle ids: the picked apps/categories are opaque tokens kept natively. In JS the whole native
 * selection is one opaque BlockedAppRef, so the shared model (apps list, "no apps = timer only") keeps working without
 * pretending iOS tokens are package names.
 */
export const IOS_SELECTION_ID = "ios:family-activity-selection";

export interface ScreenTimeCountsLike {
  applicationCount: number;
  categoryCount: number;
}

export interface ScreenTimeStatusLike extends ScreenTimeCountsLike {
  authorization: "notDetermined" | "denied" | "approved" | "unavailable";
  active: boolean;
  endsAt?: number;
  startedAt?: number;
  lockMode?: "FLEXIBLE" | "STRICT";
  origin?: "MANUAL" | "ASK" | "AUTO";
  sessionId?: string;
  dayId?: string;
  dayTitle?: string;
  shielded?: boolean;
  selectionLabel?: string;
}

/** "앱 2개 · 카테고리 1개" */
export function screenTimeSelectionLabel(counts: ScreenTimeCountsLike): string {
  const parts = [counts.applicationCount > 0 ? `앱 ${counts.applicationCount}개` : null, counts.categoryCount > 0 ? `카테고리 ${counts.categoryCount}개` : null];
  return parts.filter(Boolean).join(" · ") || "선택 없음";
}

/** The native selection as the product's app list: one opaque entry, or none. */
export function screenTimeSelectionRefs(counts: ScreenTimeCountsLike): BlockedAppRef[] {
  return counts.applicationCount + counts.categoryCount > 0 ? [{ id: IOS_SELECTION_ID, label: screenTimeSelectionLabel(counts) }] : [];
}

export function screenTimePermission(authorization: ScreenTimeStatusLike["authorization"]): BlockingPermission {
  return { state: authorization === "approved" ? "granted" : "required" };
}

export function screenTimeSnapshot(status: ScreenTimeStatusLike): BlockingSnapshot {
  const active = status.active && typeof status.endsAt === "number";
  const label = status.selectionLabel ?? screenTimeSelectionLabel(status);
  return {
    available: true,
    active,
    endsAt: active ? status.endsAt! : null,
    blockedAppIds: active && status.shielded ? [IOS_SELECTION_ID] : [],
    session: active
      ? {
          id: status.sessionId ?? null,
          dayId: status.dayId ?? null,
          dayTitle: status.dayTitle ?? null,
          lockMode: status.lockMode === "STRICT" ? "STRICT" : "FLEXIBLE",
          origin: status.origin === "ASK" || status.origin === "AUTO" ? status.origin : "MANUAL",
          startedAt: status.startedAt ?? null,
          appLabels: { [IOS_SELECTION_ID]: label },
        }
      : null,
  };
}
