import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { toPayload } from "./notification-payload";
import { toPermissionSnapshot, type PermissionSnapshot } from "./permission-state";
import { isEventReminderIdentifier, type PlannedReminder } from "./reminder-plan";

/**
 * The only module that talks to expo-notifications and storage. iOS/Android differences stay here;
 * everything that decides *what* to schedule is pure and lives in reminder-plan / reconcile-plan.
 */

export const EVENT_REMINDER_CHANNEL_ID = "dayflow-events";

/**
 * identifier → fingerprint of what was scheduled. The OS lists pending notifications by identifier, but
 * the shape of the returned trigger differs per platform, so the fingerprint is kept locally instead of
 * being read back from the OS. Not sensitive, so AsyncStorage (not SecureStore).
 */
const FINGERPRINTS_KEY = "dayflow.notifications.event-reminders.v1";

/** Reminders also show while the app is open; they never set the badge. */
export function configureForegroundPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Android 8+: reminders post to their own channel with default importance (no heads-up escalation). */
export async function ensureEventReminderChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(EVENT_REMINDER_CHANNEL_ID, {
    name: "DayFlow Events",
    description: "일정 알림 (Event reminder)",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function readPermission(): Promise<PermissionSnapshot> {
  return toPermissionSnapshot(await Notifications.getPermissionsAsync());
}

/** Shows the OS dialog. Android 13+ needs the channel to exist before asking. */
export async function requestPermission(): Promise<PermissionSnapshot> {
  await ensureEventReminderChannel();
  return toPermissionSnapshot(
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
  );
}

export function openSystemSettings(): Promise<void> {
  return Linking.openSettings();
}

/** Identifiers of the DayFlow Event reminders currently pending on the device. */
export async function listPendingReminderIds(): Promise<string[]> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  return requests.map((request) => request.identifier).filter(isEventReminderIdentifier);
}

export async function readFingerprints(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(FINGERPRINTS_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function writeFingerprints(fingerprints: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(FINGERPRINTS_KEY, JSON.stringify(fingerprints));
}

export function cancelReminder(identifier: string): Promise<void> {
  return Notifications.cancelScheduledNotificationAsync(identifier);
}

export async function scheduleReminder(reminder: PlannedReminder): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: reminder.identifier,
    content: {
      title: reminder.title,
      body: reminder.body,
      data: toPayload(reminder),
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder.triggerAt,
      channelId: EVENT_REMINDER_CHANNEL_ID,
    },
  });
}