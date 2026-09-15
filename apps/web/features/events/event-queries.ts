import type { CreateEventRequest, UpdateEventRequest } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent, isStaleDataError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";

export function useEvents() {
  return useQuery({
    queryKey: queryKeys.events.list(),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/events")),
  });
}

export function useEvent(eventId: string) {
  return useQuery({
    queryKey: queryKeys.events.detail(eventId),
    queryFn: () =>
      expectData(getDayFlowApiClient().GET("/api/v1/events/{eventId}", { params: { path: { eventId } } })),
  });
}

/** Computed occurrences for inclusive local dates (at most 366 days, see the API). */
export function useEventOccurrences(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.events.occurrences(from, to),
    queryFn: () =>
      expectData(getDayFlowApiClient().GET("/api/v1/event-occurrences", { params: { query: { from, to } } })),
  });
}

// Every Event mutation refreshes lists, details and occurrences (all under queryKeys.events.all).

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventRequest) => expectData(getDayFlowApiClient().POST("/api/v1/events", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.all }),
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, body }: { eventId: string; body: UpdateEventRequest }) =>
      expectData(getDayFlowApiClient().PATCH("/api/v1/events/{eventId}", { params: { path: { eventId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.all }),
    onError: (error) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, version }: { eventId: string; version: number }) =>
      expectNoContent(
        getDayFlowApiClient().DELETE("/api/v1/events/{eventId}", {
          params: { path: { eventId }, query: { version } },
        }),
      ),
    onSuccess: (_, { eventId }) => {
      queryClient.removeQueries({ queryKey: queryKeys.events.detail(eventId) });
      return queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
    onError: (error) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });
}
