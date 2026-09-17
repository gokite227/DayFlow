import { randomUUID } from "expo-crypto";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import type { BlockingPermission, FocusBlockingAdapter, FocusScheduleEntry, FocusScheduleState } from "./blocking-adapter";
import { getFocusBlockingAdapter } from "./focus-blocking";
import {
  EMPTY_FOCUS_STATE,
  acknowledgeEnd,
  type BlockedAppRef,
  type FocusAppSelection,
  type FocusPlatform,
  type FocusState,
} from "./focus-model";
import {
  APP_DEFAULT_FOCUS_SETTINGS,
  withDayPreference,
  type DayFocusPreference,
  type DayFocusPreferences,
  type FocusSettings,
} from "./focus-preferences";
import { reconcileFocus, startFocus, stopFocus, type FocusDeps, type StartFocusInput, type StartFocusResult } from "./focus-service";
import {
  loadAppSelection,
  loadDayPreferences,
  loadFocusSettings,
  loadFocusState,
  saveAppSelection,
  saveDayPreferences,
  saveFocusSettings,
  saveFocusState,
} from "./focus-storage";

interface FocusContextValue {
  /** False until stored sessions and settings were read and reconciled with native blocking. */
  ready: boolean;
  state: FocusState;
  /** The default blocked apps (Settings > Focus, and the Focus screen). */
  selection: FocusAppSelection;
  /** null while the user never saved Focus settings (app defaults apply). */
  storedSettings: FocusSettings | null;
  settings: FocusSettings;
  dayPreferences: DayFocusPreferences;
  /** Day schedules as the OS currently holds them (empty without OS scheduling). */
  schedules: FocusScheduleState[];
  adapter: FocusBlockingAdapter;
  permission: BlockingPermission;
  start: (input: StartFocusInput) => StartFocusResult;
  stop: () => { nativeError: string | null; locked: boolean };
  /** Re-reads native state (permission, expiry, scheduled starts) and reconciles. */
  refresh: () => void;
  acknowledgeEnd: (dayOutcome: "DONE" | "IN_PROGRESS" | null) => void;
  saveSelection: (apps: readonly BlockedAppRef[]) => void;
  saveSettings: (settings: FocusSettings) => void;
  saveDayPreference: (dayId: string, preference: DayFocusPreference) => void;
  replaceDayPreferences: (preferences: DayFocusPreferences) => void;
  /** Hands the planned Day schedules to the OS; returns what the OS now holds. */
  syncSchedules: (entries: readonly FocusScheduleEntry[]) => void;
  acceptSchedule: (id: string) => { error: string | null };
  dismissSchedule: (id: string) => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

/** How often a running Focus is reconciled while the app is open (expiry, permission, external stop). */
const ACTIVE_RECONCILE_MS = 15_000;

/**
 * Focus sessions, settings and Day overrides for the whole app: loaded once, reconciled with native blocking at
 * start, whenever the app returns to the foreground and periodically while a Focus runs, and saved after every
 * change. Day schedule automation itself runs in the OS; see FocusAutomationSync.
 */
export function FocusProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo(() => getFocusBlockingAdapter(), []);
  const platform: FocusPlatform = adapter.platform ?? (Platform.OS === "ios" ? "ios" : "android");
  const deps = useMemo<FocusDeps>(() => ({ adapter, now: () => Date.now(), newId: () => randomUUID() }), [adapter]);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<FocusState>(EMPTY_FOCUS_STATE);
  const [selection, setSelection] = useState<FocusAppSelection>({ platform, apps: [] });
  const [storedSettings, setStoredSettings] = useState<FocusSettings | null>(null);
  const [dayPreferences, setDayPreferences] = useState<DayFocusPreferences>({});
  const [schedules, setSchedules] = useState<FocusScheduleState[]>([]);
  const [permission, setPermission] = useState<BlockingPermission>(() => safePermission(adapter));
  const stateRef = useRef(state);
  const preferencesRef = useRef(dayPreferences);

  const commit = useCallback((next: FocusState) => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
    void saveFocusState(next).catch(() => undefined);
  }, []);

  const refresh = useCallback(() => {
    setPermission(safePermission(adapter));
    commit(reconcileFocus(stateRef.current, deps).state);
    setSchedules(safeList(adapter));
  }, [adapter, commit, deps]);

  useEffect(() => {
    let active = true;
    void Promise.all([loadFocusState(), loadAppSelection(platform), loadFocusSettings(), loadDayPreferences()]).then(
      ([stored, storedSelection, settings, preferences]) => {
        if (!active) return;
        stateRef.current = stored;
        setState(stored);
        setSelection(storedSelection);
        setStoredSettings(settings);
        preferencesRef.current = preferences;
        setDayPreferences(preferences);
        refresh();
        setReady(true);
      },
    );
    return () => {
      active = false;
    };
  }, [platform, refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const running = state.current?.status === "ACTIVE";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, ACTIVE_RECONCILE_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const savePreferences = useCallback((next: DayFocusPreferences) => {
    if (next === preferencesRef.current) return;
    preferencesRef.current = next;
    setDayPreferences(next);
    void saveDayPreferences(next).catch(() => undefined);
  }, []);

  // Stable, so effects that sync on data changes do not re-run just because the Focus state changed.
  const syncSchedules = useCallback(
    (entries: readonly FocusScheduleEntry[]) => {
      if (!adapter.scheduler.available) return;
      try {
        setSchedules(adapter.scheduler.sync(entries));
      } catch (error) {
        if (__DEV__) console.warn("[DayFlow] Focus schedule sync failed", error);
      }
      // A due AUTO schedule may just have started a session.
      commit(reconcileFocus(stateRef.current, deps).state);
    },
    [adapter, commit, deps],
  );

  const value = useMemo<FocusContextValue>(
    () => ({
      ready,
      state,
      selection,
      storedSettings,
      settings: storedSettings ?? APP_DEFAULT_FOCUS_SETTINGS,
      dayPreferences,
      schedules,
      adapter,
      permission,
      start: (input) => {
        refresh();
        const result = startFocus(stateRef.current, input, deps);
        if (result.ok) commit(result.state);
        else if (result.reason === "permission-required") setPermission(safePermission(adapter));
        return result;
      },
      stop: () => {
        refresh();
        const result = stopFocus(stateRef.current, deps);
        commit(result.state);
        return { nativeError: result.nativeError, locked: result.locked };
      },
      refresh,
      acknowledgeEnd: (dayOutcome) => {
        const current = stateRef.current.current;
        if (current && current.status !== "ACTIVE") commit({ ...stateRef.current, current: acknowledgeEnd(current, dayOutcome) });
      },
      saveSelection: (apps) => {
        const next = { platform, apps: [...apps] };
        setSelection(next);
        void saveAppSelection(next).catch(() => undefined);
      },
      saveSettings: (next) => {
        setStoredSettings(next);
        void saveFocusSettings(next).catch(() => undefined);
      },
      saveDayPreference: (dayId, preference) => savePreferences(withDayPreference(preferencesRef.current, dayId, preference)),
      replaceDayPreferences: savePreferences,
      syncSchedules,
      acceptSchedule: (id) => {
        try {
          adapter.scheduler.accept(id);
          refresh();
          return { error: null };
        } catch (error) {
          refresh();
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
      dismissSchedule: (id) => {
        try {
          adapter.scheduler.dismiss(id);
        } catch {
          // Nothing to dismiss natively; the prompt disappears on the next refresh anyway.
        }
        refresh();
      },
    }),
    [ready, state, selection, storedSettings, dayPreferences, schedules, adapter, permission, refresh, deps, commit, platform, savePreferences, syncSchedules],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

/** A permission read that never crashes the app (e.g. the native module is briefly unavailable). */
function safePermission(adapter: FocusBlockingAdapter): BlockingPermission {
  try {
    return adapter.getPermission();
  } catch {
    return { state: adapter.available ? "required" : "unsupported" };
  }
}

function safeList(adapter: FocusBlockingAdapter): FocusScheduleState[] {
  try {
    return adapter.scheduler.list();
  } catch {
    return [];
  }
}

export function useFocus(): FocusContextValue {
  const value = useContext(FocusContext);
  if (!value) throw new Error("useFocus must be used inside FocusProvider");
  return value;
}
