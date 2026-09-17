/**
 * Focus sessions (mobile-local). Responsibilities are split on purpose:
 * - this JS model holds the product meaning of a session: linked Day, title snapshot, history, what the user
 *   answered afterwards;
 * - the native blocking layer (Android FocusStore today) is the truth for whether apps are blocked and until when.
 * `reconcileFocusSession` brings the two back in line whenever the app starts or returns to the foreground.
 * Pure TypeScript: no React Native, no storage, no native calls.
 */

export type FocusSessionStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";
export type FocusPlatform = "android" | "ios";

/**
 * Two independent settings (never merged into one enum):
 * - FocusTriggerMode: when a Focus starts for a scheduled Day (MANUAL = only from the Focus screen).
 * - FocusLockMode: whether a running Focus can be ended early from DayFlow.
 */
export type FocusTriggerMode = "MANUAL" | "NOTIFY_ONLY" | "ASK" | "AUTO";
export type FocusLockMode = "FLEXIBLE" | "STRICT";
/** How a session actually started: the Focus screen, an accepted ASK prompt, or AUTO. */
export type FocusOrigin = "MANUAL" | "ASK" | "AUTO";

export const FOCUS_TRIGGER_MODES: readonly FocusTriggerMode[] = ["MANUAL", "NOTIFY_ONLY", "ASK", "AUTO"];
export const FOCUS_LOCK_MODES: readonly FocusLockMode[] = ["FLEXIBLE", "STRICT"];

/**
 * An app chosen for blocking. `id` is a platform identifier and is opaque to the product code: an Android
 * package name, or (later) an iOS FamilyActivitySelection token that has no readable bundle id.
 */
export interface BlockedAppRef {
  id: string;
  label: string;
  /** DayFlow app category id (see app-categories), kept so summaries work without the installed-app list. */
  category?: string;
}

export interface FocusSession {
  id: string;
  dayId: string | null;
  /** The Day title when the session started; the Day may be renamed or deleted later. */
  dayTitle: string | null;
  startedAt: string;
  endsAt: string;
  durationMinutes: number;
  status: FocusSessionStatus;
  lockMode: FocusLockMode;
  origin: FocusOrigin;
  blockedApps: BlockedAppRef[];
  /** The native blocking layer was started for this session (false: timer only). */
  blockingEngaged: boolean;
  completedAt: string | null;
  /** After the session ended: the user's answer (or dismissal) of the end card. */
  endAcknowledged: boolean;
  dayOutcome: "DONE" | "IN_PROGRESS" | null;
}

/** The persisted apps the user picked; reused for every next Focus. */
export interface FocusAppSelection {
  platform: FocusPlatform;
  apps: BlockedAppRef[];
}

export interface FocusState {
  /** The running session, or the last ended one until the next start. */
  current: FocusSession | null;
  /** Ended sessions, newest first (kept for later statistics; not shown yet). */
  history: FocusSession[];
}

/** Product metadata the native layer carries for its running session (so a scheduled start can be restored). */
export interface NativeSessionInfo {
  id: string | null;
  dayId: string | null;
  dayTitle: string | null;
  lockMode: FocusLockMode;
  origin: FocusOrigin;
  /** Epoch ms. */
  startedAt: number | null;
  appLabels: Record<string, string>;
}

/** What the native blocking layer reports; `available: false` means there is no blocking on this device. */
export interface BlockingSnapshot {
  available: boolean;
  active: boolean;
  /** Epoch ms while active. */
  endsAt: number | null;
  blockedAppIds: string[];
  /** Metadata of the running native session; absent when the platform does not report it. */
  session?: NativeSessionInfo | null;
}

export const FOCUS_DURATION_PRESETS = [25, 50] as const;
export const MIN_FOCUS_MINUTES = 1;
/** Same limit as the Android FocusPolicy. */
export const MAX_FOCUS_MINUTES = 12 * 60;
export const MAX_FOCUS_HISTORY = 50;

export const EMPTY_FOCUS_STATE: FocusState = { current: null, history: [] };

export function focusDurationProblem(minutes: number): string | null {
  if (!Number.isInteger(minutes) || minutes < MIN_FOCUS_MINUTES || minutes > MAX_FOCUS_MINUTES) {
    return `집중 시간은 ${MIN_FOCUS_MINUTES}분에서 ${MAX_FOCUS_MINUTES}분 사이로 정해주세요.`;
  }
  return null;
}

export function isFocusActive(state: FocusState): boolean {
  return state.current?.status === "ACTIVE";
}

/** FLEXIBLE: may be ended any time. STRICT: not before endsAt (then it ends by itself). */
export function canStopFocus(session: Pick<FocusSession, "status" | "lockMode" | "endsAt">, now: number): boolean {
  if (session.status !== "ACTIVE") return false;
  return session.lockMode !== "STRICT" || now >= Date.parse(session.endsAt);
}

/** Only one Focus at a time: a running one must be ended first. */
export function canStartFocus(state: FocusState): { ok: true } | { ok: false; reason: "active"; session: FocusSession } {
  const current = state.current;
  return current?.status === "ACTIVE" ? { ok: false, reason: "active", session: current } : { ok: true };
}

export function createFocusSession(input: {
  id: string;
  day: { id: string; title: string } | null;
  durationMinutes: number;
  now: number;
  /** The native end time when blocking started (the native layer decides expiry); otherwise now + duration. */
  endsAt: number | null;
  blockedApps: readonly BlockedAppRef[];
  blockingEngaged: boolean;
  lockMode?: FocusLockMode;
  origin?: FocusOrigin;
  /** When the session really started (a recovered native session); defaults to now. */
  startedAt?: number | null;
}): FocusSession {
  const endsAt = input.endsAt ?? input.now + input.durationMinutes * 60_000;
  return {
    id: input.id,
    dayId: input.day?.id ?? null,
    dayTitle: input.day?.title ?? null,
    startedAt: new Date(input.startedAt ?? input.now).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    durationMinutes: input.durationMinutes,
    status: "ACTIVE",
    lockMode: input.lockMode ?? "FLEXIBLE",
    origin: input.origin ?? "MANUAL",
    blockedApps: [...input.blockedApps],
    blockingEngaged: input.blockingEngaged,
    completedAt: null,
    endAcknowledged: false,
    dayOutcome: null,
  };
}

/** Ends a session: COMPLETED when its time ran out, CANCELLED when the user stopped it early. */
export function endFocusSession(session: FocusSession, status: "COMPLETED" | "CANCELLED", endedAt: number): FocusSession {
  if (session.status !== "ACTIVE") return session;
  return { ...session, status, completedAt: new Date(endedAt).toISOString() };
}

/** Moves an ended current session into history and starts fresh with `next`. */
export function withCurrent(state: FocusState, next: FocusSession | null): FocusState {
  const previous = state.current;
  const history = previous && previous.status !== "ACTIVE" && previous.id !== next?.id
    ? [previous, ...state.history.filter((entry) => entry.id !== previous.id)].slice(0, MAX_FOCUS_HISTORY)
    : state.history;
  return { current: next, history };
}

export function remainingSeconds(session: Pick<FocusSession, "endsAt">, now: number): number {
  return Math.max(Math.ceil((Date.parse(session.endsAt) - now) / 1000), 0);
}

export type ReconcileAction = "none" | "completed" | "cancelled" | "recovered" | "stop-native";

/**
 * Brings the JS session in line with the native blocking layer:
 * - ACTIVE and its end time passed → COMPLETED (native expired on its own).
 * - ACTIVE, but native runs a different session (e.g. an AUTO Day schedule started after this one was stopped
 *   outside the product screen) → this one is CANCELLED and the native one is recovered.
 * - ACTIVE with blocking engaged, but native reports no active blocking before the end → CANCELLED
 *   (stopped outside the product screen, e.g. the debug screen).
 * - Native active but the JS session is missing or ended:
 *   - it is the session we already ended (same id, or same end time) → ask to stop native again;
 *   - otherwise → recover it with the Day, lock mode and origin native carries (a Focus started by a Day
 *     schedule while DayFlow was closed), or without a Day when native has no metadata.
 * A permission switched off during Focus changes nothing here: the session keeps running as a timer.
 */
export function reconcileFocusSession(
  state: FocusState,
  blocking: BlockingSnapshot,
  now: number,
  newId: () => string,
): { state: FocusState; action: ReconcileAction } {
  const current = state.current;
  const nativeRunning = blocking.available && blocking.active && blocking.endsAt !== null && blocking.endsAt > now;
  const nativeId = blocking.session?.id ?? null;

  if (current?.status === "ACTIVE") {
    const endsAt = Date.parse(current.endsAt);
    if (now >= endsAt) {
      return { state: { ...state, current: endFocusSession(current, "COMPLETED", endsAt) }, action: "completed" };
    }
    if (nativeRunning && nativeId !== null && nativeId !== current.id) {
      const ended = { ...state, current: endFocusSession(current, "CANCELLED", now) };
      return { state: withCurrent(ended, recoverNativeSession(blocking, now, newId)), action: "recovered" };
    }
    if (current.blockingEngaged && blocking.available && !blocking.active) {
      return { state: { ...state, current: endFocusSession(current, "CANCELLED", now) }, action: "cancelled" };
    }
    return { state, action: "none" };
  }

  if (nativeRunning) {
    const sameSession = current !== null && (nativeId !== null ? nativeId === current.id : Date.parse(current.endsAt) === blocking.endsAt);
    if (sameSession) return { state, action: "stop-native" };
    return { state: withCurrent(state, recoverNativeSession(blocking, now, newId)), action: "recovered" };
  }

  return { state, action: "none" };
}

function recoverNativeSession(blocking: BlockingSnapshot, now: number, newId: () => string): FocusSession {
  const info = blocking.session ?? null;
  const endsAt = blocking.endsAt ?? now;
  const startedAt = info?.startedAt ?? null;
  const labels = info?.appLabels ?? {};
  return createFocusSession({
    id: info?.id ?? newId(),
    day: info?.dayId ? { id: info.dayId, title: info.dayTitle ?? "" } : null,
    durationMinutes: Math.max(Math.round((endsAt - (startedAt ?? now)) / 60_000), 1),
    now,
    startedAt,
    endsAt,
    blockedApps: blocking.blockedAppIds.map((id) => ({ id, label: labels[id] ?? id })),
    blockingEngaged: true,
    lockMode: info?.lockMode ?? "FLEXIBLE",
    origin: info?.origin ?? "MANUAL",
  });
}

/** The end card is shown once per ended session. */
export function needsEndPrompt(session: FocusSession | null): session is FocusSession {
  return session !== null && session.status !== "ACTIVE" && !session.endAcknowledged;
}

export function acknowledgeEnd(session: FocusSession, dayOutcome: "DONE" | "IN_PROGRESS" | null): FocusSession {
  return { ...session, endAcknowledged: true, dayOutcome };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isString = (value: unknown): value is string => typeof value === "string";

function parseApps(value: unknown): BlockedAppRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => (isRecord(entry) && isString(entry.id) && isString(entry.label)
      ? [isString(entry.category) ? { id: entry.id, label: entry.label, category: entry.category } : { id: entry.id, label: entry.label }]
      : []));
}

function parseSession(value: unknown): FocusSession | null {
  if (!isRecord(value)) return null;
  const { id, startedAt, endsAt, durationMinutes, status } = value;
  if (!isString(id) || !isString(startedAt) || !isString(endsAt) || Number.isNaN(Date.parse(endsAt))) return null;
  if (typeof durationMinutes !== "number" || !["ACTIVE", "COMPLETED", "CANCELLED"].includes(status as string)) return null;
  return {
    id,
    dayId: isString(value.dayId) ? value.dayId : null,
    dayTitle: isString(value.dayTitle) ? value.dayTitle : null,
    startedAt,
    endsAt,
    durationMinutes,
    status: status as FocusSessionStatus,
    lockMode: value.lockMode === "STRICT" ? "STRICT" : "FLEXIBLE",
    origin: value.origin === "ASK" || value.origin === "AUTO" ? value.origin : "MANUAL",
    blockedApps: parseApps(value.blockedApps),
    blockingEngaged: value.blockingEngaged === true,
    completedAt: isString(value.completedAt) ? value.completedAt : null,
    endAcknowledged: value.endAcknowledged === true,
    dayOutcome: value.dayOutcome === "DONE" || value.dayOutcome === "IN_PROGRESS" ? value.dayOutcome : null,
  };
}

/** Stored data is read defensively: broken entries are dropped instead of crashing the app. */
export function parseFocusState(raw: unknown): FocusState {
  if (!isRecord(raw)) return EMPTY_FOCUS_STATE;
  const history = Array.isArray(raw.history) ? raw.history.map(parseSession).filter((entry): entry is FocusSession => entry !== null) : [];
  return { current: parseSession(raw.current), history: history.slice(0, MAX_FOCUS_HISTORY) };
}

export function parseAppSelection(raw: unknown, platform: FocusPlatform): FocusAppSelection {
  if (!isRecord(raw) || raw.platform !== platform) return { platform, apps: [] };
  const apps = parseApps(raw.apps);
  return { platform, apps: apps.filter((app, index) => apps.findIndex((other) => other.id === app.id) === index) };
}
