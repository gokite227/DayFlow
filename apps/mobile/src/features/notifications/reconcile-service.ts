import { expectData } from "@/lib/api-error";
import { getDayFlowApiClient } from "@/lib/api-client";
import { toLocalDate } from "@/lib/dates";
import {
  cancelReminder,
  listPendingReminderIds,
  readFingerprints,
  readPermission,
  scheduleReminder,
  writeFingerprints,
} from "./notification-adapter";
import { canScheduleNotifications, type NotificationPermissionState } from "./permission-state";
import { nextFingerprints, planReconcile } from "./reconcile-plan";
import { occurrenceFetchRange, planEventReminders } from "./reminder-plan";

export type ReconcileReason = "app-start" | "foreground" | "event-mutation" | "permission-changed" | "manual";

export interface ReconcileResult {
  at: number;
  reason: ReconcileReason;
  status: "ok" | "error";
  permission: NotificationPermissionState | null;
  planned: number;
  scheduled: number;
  cancelled: number;
  unchanged: number;
  failed: number;
  /** Development detail only; never shown to users as-is. */
  error?: string;
}

let running: Promise<ReconcileResult> | null = null;
let queued: ReconcileReason | null = null;
let lastResult: ReconcileResult | null = null;
const listeners = new Set<() => void>();

export function getLastReconcileResult(): ReconcileResult | null {
  return lastResult;
}

export function subscribeReconcileResult(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(result: ReconcileResult): ReconcileResult {
  lastResult = result;
  listeners.forEach((listener) => listener());
  return result;
}

/**
 * Brings the device's pending Event reminders in line with the server (requirements §11.3). Called on
 * app start, foreground and after successful Event mutations — never on render. One run at a time;
 * a request during a run queues one more run so the latest server state always wins. Never throws:
 * a failure (offline, API down) leaves the existing notifications untouched until the next run.
 */
export function reconcileEventReminders(reason: ReconcileReason): Promise<ReconcileResult> {
  if (running) {
    queued = reason;
    return running;
  }
  running = run(reason).finally(() => {
    running = null;
    if (queued !== null) {
      const next = queued;
      queued = null;
      void reconcileEventReminders(next);
    }
  });
  return running;
}

/**
 * After a sign-out (AUTH-005): cancel every DayFlow Event reminder on this device and forget their fingerprints,
 * so the next user never gets the previous user's reminders. Never throws.
 */
export async function clearEventReminders(): Promise<void> {
  try {
    for (const identifier of await listPendingReminderIds()) {
      await cancelReminder(identifier).catch(() => undefined);
    }
    await writeFingerprints({});
  } catch (error) {
    if (__DEV__) console.warn("[DayFlow] Clearing Event reminders after sign-out failed", error);
  }
}

async function run(reason: ReconcileReason): Promise<ReconcileResult> {
  const base = { at: Date.now(), reason, planned: 0, scheduled: 0, cancelled: 0, unchanged: 0, failed: 0 };
  let permission: NotificationPermissionState | null = null;
  try {
    const snapshot = await readPermission();
    permission = snapshot.state;
    const client = getDayFlowApiClient();
    const range = occurrenceFetchRange(toLocalDate(new Date()));
    // Both requests must succeed before anything is cancelled.
    const [events, occurrences] = await Promise.all([
      expectData(client.GET("/api/v1/events")),
      expectData(client.GET("/api/v1/event-occurrences", { params: { query: range } })),
    ]);
    const desired = canScheduleNotifications(snapshot) ? planEventReminders(events, occurrences, { now: Date.now() }) : [];
    const [pendingIds, fingerprints] = await Promise.all([listPendingReminderIds(), readFingerprints()]);
    const plan = planReconcile(
      desired,
      pendingIds.map((identifier) => ({ identifier, fingerprint: fingerprints[identifier] ?? null })),
    );

    const failed = new Set<string>();
    for (const identifier of plan.toCancel) {
      await cancelReminder(identifier).catch(() => failed.add(identifier));
    }
    for (const reminder of plan.toSchedule) {
      await scheduleReminder(reminder).catch(() => failed.add(reminder.identifier));
    }
    await writeFingerprints(nextFingerprints(desired, plan, failed));

    return publish({
      ...base,
      status: "ok",
      permission,
      planned: desired.length,
      scheduled: plan.toSchedule.length,
      cancelled: plan.toCancel.length,
      unchanged: plan.unchanged.length,
      failed: failed.size,
    });
  } catch (error) {
    if (__DEV__) console.warn("[DayFlow] Event reminder reconcile failed", error);
    return publish({ ...base, status: "error", permission, error: error instanceof Error ? error.message : String(error) });
  }
}