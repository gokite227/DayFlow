import type { FocusBlockingAdapter } from "./blocking-adapter";
import {
  canStartFocus,
  canStopFocus,
  createFocusSession,
  endFocusSession,
  focusDurationProblem,
  reconcileFocusSession,
  withCurrent,
  type BlockedAppRef,
  type FocusLockMode,
  type FocusOrigin,
  type FocusSession,
  type FocusState,
  type ReconcileAction,
} from "./focus-model";

/**
 * Focus start / stop / reconcile against a blocking adapter. Pure functions of (state, deps): the provider
 * persists the returned state. Native errors never throw out of here; they become a result the screen can show.
 */
export interface FocusDeps {
  adapter: FocusBlockingAdapter;
  now: () => number;
  newId: () => string;
}

export type StartFocusResult =
  | { ok: true; state: FocusState; session: FocusSession }
  | { ok: false; reason: "active"; session: FocusSession }
  | { ok: false; reason: "invalid-duration"; message: string }
  | { ok: false; reason: "permission-required" }
  | { ok: false; reason: "native-error"; message: string };

export interface StartFocusInput {
  day: { id: string; title: string } | null;
  /** Manual Focus: 25 / 50 / custom minutes. Ignored when `endsAt` is given. */
  durationMinutes: number;
  apps: readonly BlockedAppRef[];
  lockMode: FocusLockMode;
  /** A Day schedule based Focus ends with the schedule (epoch ms), whatever the minutes. */
  endsAt?: number;
  origin?: FocusOrigin;
}

/**
 * 1. Only one Focus at a time. 2. Apps selected but blocking not allowed → ask for the permission (nothing
 * starts). 3. Native first (block list + start), so the session end time is the native one. 4. The ACTIVE
 * session is returned for saving. With no apps selected, or without native blocking, Focus is a timer.
 */
export function startFocus(
  state: FocusState,
  input: StartFocusInput,
  deps: FocusDeps,
): StartFocusResult {
  const allowed = canStartFocus(state);
  if (!allowed.ok) return { ok: false, reason: "active", session: allowed.session };
  const now = deps.now();
  const durationMinutes = input.endsAt === undefined ? input.durationMinutes : Math.ceil((input.endsAt - now) / 60_000);
  const durationProblem =
    input.endsAt !== undefined && input.endsAt <= now ? "일정이 이미 끝났어요." : focusDurationProblem(durationMinutes);
  if (durationProblem) return { ok: false, reason: "invalid-duration", message: durationProblem };
  const requestedEnd = input.endsAt ?? now + durationMinutes * 60_000;
  const sessionId = deps.newId();

  const { adapter } = deps;
  const wantsBlocking = input.apps.length > 0 && adapter.available;
  if (wantsBlocking && adapter.getPermission().state !== "granted") return { ok: false, reason: "permission-required" };

  let endsAt: number | null = null;
  let blockingEngaged = false;
  if (adapter.available) {
    try {
      // Also for an empty list: the native end time then drives expiry for timer-only sessions too.
      const snapshot = adapter.startBlocking({
        sessionId,
        apps: wantsBlocking ? input.apps : [],
        endsAt: requestedEnd,
        lockMode: input.lockMode,
        dayId: input.day?.id ?? null,
        dayTitle: input.day?.title ?? null,
        origin: input.origin ?? "MANUAL",
      });
      endsAt = snapshot.active ? snapshot.endsAt : null;
      blockingEngaged = snapshot.active;
    } catch (error) {
      return { ok: false, reason: "native-error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  const session = createFocusSession({
    id: sessionId,
    day: input.day,
    durationMinutes,
    now,
    endsAt: endsAt ?? requestedEnd,
    blockedApps: wantsBlocking ? input.apps : [],
    blockingEngaged,
    lockMode: input.lockMode,
    origin: input.origin ?? "MANUAL",
  });
  return { ok: true, state: withCurrent(state, session), session };
}

/**
 * Manual end: native blocking is lifted first, then the session is CANCELLED. A STRICT session is refused before
 * its end time (`locked`); native refuses it as well, so no caller can end it early.
 */
export function stopFocus(state: FocusState, deps: FocusDeps): { state: FocusState; nativeError: string | null; locked: boolean } {
  const current = state.current;
  if (current?.status !== "ACTIVE") return { state, nativeError: null, locked: false };
  if (!canStopFocus(current, deps.now())) return { state, nativeError: null, locked: true };
  let nativeError: string | null = null;
  if (deps.adapter.available) {
    try {
      deps.adapter.stopBlocking();
    } catch (error) {
      nativeError = error instanceof Error ? error.message : String(error);
    }
  }
  return { state: { ...state, current: endFocusSession(current, "CANCELLED", deps.now()) }, nativeError, locked: false };
}

/** Reads the native state and applies reconcileFocusSession; stops native blocking left over from an ended session. */
export function reconcileFocus(state: FocusState, deps: FocusDeps): { state: FocusState; action: ReconcileAction } {
  let snapshot;
  try {
    snapshot = deps.adapter.getStatus();
  } catch {
    // Native not reachable right now: keep the JS session and decide by time only.
    snapshot = { available: false, active: false, endsAt: null, blockedAppIds: [] };
  }
  const result = reconcileFocusSession(state, snapshot, deps.now(), deps.newId);
  if (result.action === "stop-native" || (result.action === "completed" && snapshot.active)) {
    try {
      deps.adapter.stopBlocking();
    } catch {
      // Expiry is enforced natively by endsAt anyway.
    }
  }
  return result;
}
