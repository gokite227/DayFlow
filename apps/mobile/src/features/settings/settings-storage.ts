import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type AppSettings } from "./settings-model";

/** The only place settings touch storage. */
const SETTINGS_KEY = "dayflow.settings.v1";

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw === null ? DEFAULT_SETTINGS : parseSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, serializeSettings(settings));
}