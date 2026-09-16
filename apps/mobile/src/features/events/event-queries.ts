import type { CreateEventRequest, UpdateEventRequest } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reconcileEventReminders } from "@/features/notifications/reconcile-service";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { eventMutationCallbacks } from "./event-mutation-effects";

export function useEvents() {
  return useQuery({
    queryKey: queryKeys.events.list(),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/events")),
  });
}

export function useEvent(eventId: string) {
  return useQuery({
    queryKey: queryKeys.events.detail(eventId),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/events/{eventId}", { params: { path: { eventId } } })),
  });
}

/** Inclusive local dates in each Event's timezone, at most 366 days (API limit). */
export function useEventOccurrences(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.events.occurrences(from, to),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/event-occurrences", { params: { query: { from, to } } })),
  });
}

export function useEventCategories() {
  return useQuery({
    queryKey: queryKeys.eventCategories.list(),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/event-categories", {})),
  });
}

/** Server success → refetch Events → reconcile device notifications (never the other way around). */
function useEventMutationCallbacks() {
  const queryClient = useQueryClient();
  return eventMutationCallbacks({
    invalidateEvents: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.all }),
    reconcileReminders: reconcileEventReminders,
  });
}

export function useCreateEvent() {
  return useMutation({
    mutationFn: (body: CreateEventRequest) => expectData(getDayFlowApiClient().POST("/api/v1/events", { body })),
    ...useEventMutationCallbacks(),
  });
}

export function useUpdateEvent() {
  return useMutation({
    mutationFn: ({ eventId, body }: { eventId: string; body: UpdateEventRequest }) =>
      expectData(getDayFlowApiClient().PATCH("/api/v1/events/{eventId}", { params: { path: { eventId } }, body })),
    ...useEventMutationCallbacks(),
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  const callbacks = useEventMutationCallbacks();
  return useMutation({
    mutationFn: ({ eventId, version }: { eventId: string; version: number }) =>
      expectNoContent(getDayFlowApiClient().DELETE("/api/v1/events/{eventId}", { params: { path: { eventId }, query: { version } } })),
    onSuccess: async (_, { eventId }) => {
      queryClient.removeQueries({ queryKey: queryKeys.events.detail(eventId) });
      await callbacks.onSuccess();
    },
    onError: callbacks.onError,
  });
}