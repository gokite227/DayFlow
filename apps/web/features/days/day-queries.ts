import type { CreateDayRequest, SetDayScheduleRequest, UpdateDayRequest } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent, isStaleDataError } from "@/lib/api-error";
import { queryKeys, type DayListFilters } from "@/lib/query-keys";

export function useDays(filters: DayListFilters = {}) {
  return useQuery({
    queryKey: queryKeys.days.list(filters),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/days", { params: { query: filters } })),
  });
}

export function useCreateDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDayRequest) => expectData(getDayFlowApiClient().POST("/api/v1/days", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.days.all }),
  });
}

export function useUpdateDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dayId, body }: { dayId: string; body: UpdateDayRequest }) =>
      expectData(getDayFlowApiClient().PATCH("/api/v1/days/{dayId}", { params: { path: { dayId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.days.all }),
    onError: (error) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
    },
  });
}

/**
 * Creates or replaces a Day's schedule. Callers pass expectedVersion: null to create and the
 * current schedule version to replace. A 409 means our copy is stale, so Days are refetched.
 */
export function useSetDaySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dayId, body }: { dayId: string; body: SetDayScheduleRequest }) =>
      expectData(getDayFlowApiClient().PUT("/api/v1/days/{dayId}/schedule", { params: { path: { dayId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.days.all }),
    onError: (error) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
    },
  });
}

/** Removes only the time placement; the Day and its plannedDate are kept. */
export function useDeleteDaySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dayId: string) =>
      expectNoContent(
        getDayFlowApiClient().DELETE("/api/v1/days/{dayId}/schedule", { params: { path: { dayId } } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.days.all }),
    onError: (error) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
    },
  });
}

export function useDeleteDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dayId: string) =>
      expectNoContent(getDayFlowApiClient().DELETE("/api/v1/days/{dayId}", { params: { path: { dayId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.days.all }),
  });
}
