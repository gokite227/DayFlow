import { isStaleDataError } from "../../lib/api-error";

export interface EventMutationDeps {
  /** Refetches Event lists, details and occurrences. */
  invalidateEvents: () => Promise<unknown>;
  /** Re-plans device notifications from the server state. */
  reconcileReminders: (reason: "event-mutation") => Promise<unknown>;
}

/**
 * Shared callbacks of the Event create/update/delete mutations (requirements §11.3): notifications are
 * reconciled only after the server accepted the change. A failed save leaves notifications as they were;
 * a 404/409 only refetches, since the server state did not change because of this request.
 */
export function eventMutationCallbacks(deps: EventMutationDeps) {
  return {
    onSuccess: async () => {
      await deps.invalidateEvents();
      void deps.reconcileReminders("event-mutation").catch(() => undefined);
    },
    onError: (error: unknown) => {
      if (isStaleDataError(error)) void deps.invalidateEvents();
    },
  };
}