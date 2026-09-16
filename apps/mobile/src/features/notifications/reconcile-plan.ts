import type { PlannedReminder } from "./reminder-plan";

/** A DayFlow Event reminder currently pending on the device, with the fingerprint saved when it was scheduled. */
export interface ScheduledReminder {
  identifier: string;
  /** null when the local mapping has no entry (e.g. storage was cleared): treated as outdated. */
  fingerprint: string | null;
}

export interface ReconcilePlan {
  /** Pending notifications whose Event, occurrence or reminder is gone, or whose content/time changed. */
  toCancel: string[];
  /** New reminders, and changed ones scheduled again after their old version is cancelled. */
  toSchedule: PlannedReminder[];
  /** Already correct: left untouched. */
  unchanged: string[];
}

/**
 * Diff between what should be pending and what is pending. Cancelling first and then scheduling the
 * same identifier replaces a changed notification without ever leaving two copies.
 */
export function planReconcile(desired: readonly PlannedReminder[], scheduled: readonly ScheduledReminder[]): ReconcilePlan {
  const desiredById = new Map(desired.map((reminder) => [reminder.identifier, reminder]));
  const scheduledById = new Map(scheduled.map((reminder) => [reminder.identifier, reminder]));

  const toCancel = scheduled
    .filter((current) => desiredById.get(current.identifier)?.fingerprint !== current.fingerprint)
    .map((current) => current.identifier);
  const toSchedule = desired.filter(
    (reminder) => scheduledById.get(reminder.identifier)?.fingerprint !== reminder.fingerprint,
  );
  const unchanged = desired
    .filter((reminder) => scheduledById.get(reminder.identifier)?.fingerprint === reminder.fingerprint)
    .map((reminder) => reminder.identifier);

  return { toCancel: [...new Set(toCancel)], toSchedule, unchanged };
}

/** The mapping to persist after applying a plan: exactly the reminders that are now pending. */
export function nextFingerprints(desired: readonly PlannedReminder[], plan: ReconcilePlan, failed: ReadonlySet<string>): Record<string, string> {
  const pending = new Set([...plan.unchanged, ...plan.toSchedule.map((reminder) => reminder.identifier)]);
  return Object.fromEntries(
    desired
      .filter((reminder) => pending.has(reminder.identifier) && !failed.has(reminder.identifier))
      .map((reminder) => [reminder.identifier, reminder.fingerprint]),
  );
}