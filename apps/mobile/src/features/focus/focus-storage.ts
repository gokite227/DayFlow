import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseDayPreferences, parseFocusSettings, type DayFocusPreferences, type FocusSettings } from "./focus-preferences";
import { EMPTY_FOCUS_STATE, parseAppSelection, parseFocusState, type FocusAppSelection, type FocusPlatform, type FocusState } from "./focus-model";

/** The only place Focus touches storage (device-local, like the app settings). */
const STATE_KEY = "dayflow.focus.sessions.v1";
const SELECTION_KEY = "dayflow.focus.selection.v1";

export async function loadFocusState(): Promise<FocusState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw === null ? EMPTY_FOCUS_STATE : parseFocusState(JSON.parse(raw));
  } catch {
    return EMPTY_FOCUS_STATE;
  }
}

export async function saveFocusState(state: FocusState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export async function loadAppSelection(platform: FocusPlatform): Promise<FocusAppSelection> {
  try {
    const raw = await AsyncStorage.getItem(SELECTION_KEY);
    return parseAppSelection(raw === null ? null : JSON.parse(raw), platform);
  } catch {
    return { platform, apps: [] };
  }
}

export async function saveAppSelection(selection: FocusAppSelection): Promise<void> {
  await AsyncStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
}

const SETTINGS_KEY = "dayflow.focus.settings.v1";
const DAY_PREFERENCES_KEY = "dayflow.focus.day-preferences.v1";

export async function loadFocusSettings(): Promise<FocusSettings | null> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw === null ? null : parseFocusSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveFocusSettings(settings: FocusSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadDayPreferences(): Promise<DayFocusPreferences> {
  try {
    const raw = await AsyncStorage.getItem(DAY_PREFERENCES_KEY);
    return raw === null ? {} : parseDayPreferences(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function saveDayPreferences(preferences: DayFocusPreferences): Promise<void> {
  await AsyncStorage.setItem(DAY_PREFERENCES_KEY, JSON.stringify(preferences));
}
