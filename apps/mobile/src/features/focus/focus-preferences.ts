import type { BlockedAppRef, FocusLockMode, FocusTriggerMode } from "./focus-model";

/**
 * Focus settings, device-local (no backend field on Day). Resolution order for a Day:
 * 1. the Day's own override (DayFocusPreference),
 * 2. the user's Focus settings (Settings > Focus),
 * 3. the app defaults (ASK + FLEXIBLE).
 * Blocked apps: the Day's own list, otherwise the default app selection.
 */
export interface FocusSettings {
  /** What happens when a scheduled Day starts. MANUAL = no automation. */
  triggerMode: FocusTriggerMode;
  /** Lock mode of automated Focus sessions, and the preselected mode on the Focus screen. */
  lockMode: FocusLockMode;
}

export const APP_DEFAULT_FOCUS_SETTINGS: FocusSettings = { triggerMode: "ASK", lockMode: "FLEXIBLE" };

export interface DayFocusPreference {
  triggerMode: FocusTriggerMode | "DEFAULT";
  lockMode: FocusLockMode | "DEFAULT";
  /** null = the default app selection. */
  apps: BlockedAppRef[] | null;
}

export type DayFocusPreferences = Readonly<Record<string, DayFocusPreference>>;

export const DEFAULT_DAY_FOCUS_PREFERENCE: DayFocusPreference = { triggerMode: "DEFAULT", lockMode: "DEFAULT", apps: null };

export type SettingSource = "day" | "settings" | "app";

export interface ResolvedDayFocus {
  triggerMode: FocusTriggerMode;
  lockMode: FocusLockMode;
  apps: BlockedAppRef[];
  source: { triggerMode: SettingSource; lockMode: SettingSource; apps: "day" | "default" };
}

/** `settings` is null while the user never saved Focus settings. */
export function resolveDayFocus(
  preference: DayFocusPreference | undefined,
  settings: FocusSettings | null,
  defaultApps: readonly BlockedAppRef[],
): ResolvedDayFocus {
  const base = settings ?? APP_DEFAULT_FOCUS_SETTINGS;
  const baseSource: SettingSource = settings ? "settings" : "app";
  const dayTrigger = preference && preference.triggerMode !== "DEFAULT" ? preference.triggerMode : null;
  const dayLock = preference && preference.lockMode !== "DEFAULT" ? preference.lockMode : null;
  return {
    triggerMode: dayTrigger ?? base.triggerMode,
    lockMode: dayLock ?? base.lockMode,
    apps: [...(preference?.apps ?? defaultApps)],
    source: {
      triggerMode: dayTrigger ? "day" : baseSource,
      lockMode: dayLock ? "day" : baseSource,
      apps: preference?.apps ? "day" : "default",
    },
  };
}

export function isDefaultPreference(preference: DayFocusPreference): boolean {
  return preference.triggerMode === "DEFAULT" && preference.lockMode === "DEFAULT" && preference.apps === null;
}

/** Stores a Day override; an override equal to "use the defaults" is removed instead of stored. */
export function withDayPreference(preferences: DayFocusPreferences, dayId: string, preference: DayFocusPreference): Record<string, DayFocusPreference> {
  const next = { ...preferences };
  if (isDefaultPreference(preference)) delete next[dayId];
  else next[dayId] = preference;
  return next;
}

/** Overrides of Days that no longer exist (deleted, or another account's) are dropped. */
export function pruneDayPreferences(preferences: DayFocusPreferences, existingDayIds: ReadonlySet<string>): DayFocusPreferences {
  const kept = Object.entries(preferences).filter(([dayId]) => existingDayIds.has(dayId));
  return kept.length === Object.keys(preferences).length ? preferences : Object.fromEntries(kept);
}

/** AUTO + STRICT locks without asking: shown once as a confirmation whenever a setting turns into it. */
export function needsAutoStrictConfirmation(previous: Pick<FocusSettings, "triggerMode" | "lockMode">, next: Pick<FocusSettings, "triggerMode" | "lockMode">): boolean {
  const isAutoStrict = (value: Pick<FocusSettings, "triggerMode" | "lockMode">) => value.triggerMode === "AUTO" && value.lockMode === "STRICT";
  return isAutoStrict(next) && !isAutoStrict(previous);
}

const TRIGGERS: readonly string[] = ["MANUAL", "NOTIFY_ONLY", "ASK", "AUTO"];
const LOCKS: readonly string[] = ["FLEXIBLE", "STRICT"];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function parseApps(value: unknown): BlockedAppRef[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((entry) =>
    isRecord(entry) && typeof entry.id === "string" && typeof entry.label === "string"
      ? [typeof entry.category === "string" ? { id: entry.id, label: entry.label, category: entry.category } : { id: entry.id, label: entry.label }]
      : [],
  );
}

/** null when nothing (valid) was stored, so the app defaults apply. */
export function parseFocusSettings(raw: unknown): FocusSettings | null {
  if (!isRecord(raw)) return null;
  return {
    triggerMode: TRIGGERS.includes(raw.triggerMode as string) ? (raw.triggerMode as FocusTriggerMode) : APP_DEFAULT_FOCUS_SETTINGS.triggerMode,
    lockMode: LOCKS.includes(raw.lockMode as string) ? (raw.lockMode as FocusLockMode) : APP_DEFAULT_FOCUS_SETTINGS.lockMode,
  };
}

export function parseDayPreferences(raw: unknown): DayFocusPreferences {
  if (!isRecord(raw)) return {};
  const entries = Object.entries(raw).flatMap(([dayId, value]): [string, DayFocusPreference][] => {
    if (!isRecord(value)) return [];
    const preference: DayFocusPreference = {
      triggerMode: TRIGGERS.includes(value.triggerMode as string) ? (value.triggerMode as FocusTriggerMode) : "DEFAULT",
      lockMode: LOCKS.includes(value.lockMode as string) ? (value.lockMode as FocusLockMode) : "DEFAULT",
      apps: parseApps(value.apps),
    };
    return isDefaultPreference(preference) ? [] : [[dayId, preference]];
  });
  return Object.fromEntries(entries);
}

export const TRIGGER_MODE_LABEL: Record<FocusTriggerMode, string> = {
  MANUAL: "사용 안 함",
  NOTIFY_ONLY: "알림만",
  ASK: "시작 여부 묻기",
  AUTO: "자동 시작",
};

export const TRIGGER_MODE_HINT: Record<FocusTriggerMode, string> = {
  MANUAL: "일정이 시작돼도 아무 일도 하지 않아요. 집중은 직접 시작해요.",
  NOTIFY_ONLY: "일정 시작 시 알림만 보내요. 앱은 차단하지 않아요.",
  ASK: "일정 시작 시 알림으로 집중을 시작할지 물어봐요.",
  AUTO: "일정 시작 시 확인 없이 집중을 시작하고 앱을 차단해요.",
};

export const LOCK_MODE_LABEL: Record<FocusLockMode, string> = {
  FLEXIBLE: "해제 가능",
  STRICT: "종료 시각까지 해제 불가",
};

export const LOCK_MODE_HINT: Record<FocusLockMode, string> = {
  FLEXIBLE: "집중 중에도 원하면 종료할 수 있어요.",
  STRICT: "설정한 시간이 끝날 때까지 DayFlow에서는 잠금을 해제할 수 없어요.",
};

export const AUTO_STRICT_CONFIRMATION = "일정 시간이 되면 자동으로 잠금이 시작되고 종료 시각까지 DayFlow에서 해제할 수 없습니다.";
