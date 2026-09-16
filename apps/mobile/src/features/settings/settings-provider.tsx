import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type AppSettings } from "./settings-model";
import { loadSettings, saveSettings } from "./settings-storage";

interface SettingsContextValue {
  settings: AppSettings;
  /** False until stored settings were read; the app waits so tabs and theme do not flash. */
  ready: boolean;
  update: (change: Partial<AppSettings>) => void;
  reset: (keys: (keyof AppSettings)[]) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ settings: AppSettings; ready: boolean }>({ settings: DEFAULT_SETTINGS, ready: false });

  useEffect(() => {
    let active = true;
    void loadSettings().then((settings) => {
      if (active) setState({ settings, ready: true });
    });
    return () => {
      active = false;
    };
  }, []);

  const commit = useCallback((next: (current: AppSettings) => AppSettings) => {
    setState((current) => {
      const settings = next(current.settings);
      void saveSettings(settings).catch(() => undefined);
      return { settings, ready: current.ready };
    });
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings: state.settings,
      ready: state.ready,
      update: (change) => commit((current) => ({ ...current, ...change })),
      reset: (keys) =>
        commit((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, DEFAULT_SETTINGS[key]])) })),
    }),
    [state, commit],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}