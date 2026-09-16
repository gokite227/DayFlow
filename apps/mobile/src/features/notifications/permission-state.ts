/** User-facing notification permission state (requirements: 허용됨 / 거부됨 / 미결정). */
export type NotificationPermissionState = "granted" | "denied" | "undetermined";

export interface PermissionSnapshot {
  state: NotificationPermissionState;
  /** Whether the OS dialog can still be shown; otherwise only the OS settings can change it. */
  canAskAgain: boolean;
}

/** The subset of expo-notifications' NotificationPermissionsStatus this app reads. */
export interface RawPermissionStatus {
  status: "granted" | "denied" | "undetermined" | string;
  granted: boolean;
  canAskAgain: boolean;
  ios?: { status: number } | undefined;
}

/** iOS UNAuthorizationStatus: 0 notDetermined, 1 denied, 2 authorized, 3 provisional, 4 ephemeral. */
const IOS_PROVISIONAL = 3;
const IOS_EPHEMERAL = 4;

export function toPermissionSnapshot(raw: RawPermissionStatus): PermissionSnapshot {
  const iosQuietlyAllowed = raw.ios?.status === IOS_PROVISIONAL || raw.ios?.status === IOS_EPHEMERAL;
  if (raw.granted || raw.status === "granted" || iosQuietlyAllowed) return { state: "granted", canAskAgain: raw.canAskAgain };
  if (raw.status === "denied") return { state: "denied", canAskAgain: raw.canAskAgain };
  return { state: "undetermined", canAskAgain: true };
}

export const PERMISSION_STATE_LABEL: Record<NotificationPermissionState, string> = {
  granted: "허용됨",
  denied: "거부됨",
  undetermined: "미결정",
};

export type PermissionAction = "none" | "request" | "open-settings";

/** What the permission card offers: nothing, the OS dialog (after an explanation), or the OS settings. */
export function permissionAction(snapshot: PermissionSnapshot): PermissionAction {
  if (snapshot.state === "granted") return "none";
  if (snapshot.state === "undetermined" || snapshot.canAskAgain) return "request";
  return "open-settings";
}

/** Reminders can only fire when allowed; scheduling while not allowed is skipped, not an error. */
export function canScheduleNotifications(snapshot: PermissionSnapshot): boolean {
  return snapshot.state === "granted";
}