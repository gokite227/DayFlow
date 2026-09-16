import type { PlannedReminder } from "./reminder-plan";

/** requirements §11.3: the payload carries only these ids and the deep link, nothing sensitive. */
export interface EventReminderPayload {
  [key: string]: unknown;
  notificationId: string;
  eventId: string;
  occurrenceStartAt: string;
  deepLink: string;
}

export function toPayload(reminder: PlannedReminder): EventReminderPayload {
  return {
    notificationId: reminder.identifier,
    eventId: reminder.eventId,
    occurrenceStartAt: reminder.occurrenceStartAt,
    deepLink: reminder.deepLink,
  };
}

/** Screen to open for a tapped notification, or null when the payload is not a DayFlow Event reminder. */
export function routeForPayload(data: unknown): { pathname: "/events/[eventId]"; params: { eventId: string; occurrence?: string } } | null {
  if (typeof data !== "object" || data === null) return null;
  const { eventId, occurrenceStartAt } = data as Partial<Record<keyof EventReminderPayload, unknown>>;
  if (typeof eventId !== "string" || !/^[0-9a-fA-F-]{8,64}$/.test(eventId)) return null;
  return {
    pathname: "/events/[eventId]",
    params: typeof occurrenceStartAt === "string" && occurrenceStartAt !== "" ? { eventId, occurrence: occurrenceStartAt } : { eventId },
  };
}