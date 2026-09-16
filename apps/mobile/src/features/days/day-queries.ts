import type { CreateDayRequest, UpdateDayRequest } from "@dayflow/api-client";
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

export function useDayTags() {
  return useQuery({
    queryKey: queryKeys.dayTags.list(),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/day-tags", {})),
  });
}

function useDayMutationOptions() {
  const queryClient = useQueryClient();
  return {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.days.all }),
    onError: (error: unknown) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
    },
  };
}

export function useCreateDay() {
  return useMutation({
    mutationFn: (body: CreateDayRequest) => expectData(getDayFlowApiClient().POST("/api/v1/days", { body })),
    ...useDayMutationOptions(),
  });
}

export function useUpdateDay() {
  return useMutation({
    mutationFn: ({ dayId, body }: { dayId: string; body: UpdateDayRequest }) =>
      expectData(getDayFlowApiClient().PATCH("/api/v1/days/{dayId}", { params: { path: { dayId } }, body })),
    ...useDayMutationOptions(),
  });
}

export function useDeleteDay() {
  return useMutation({
    mutationFn: (dayId: string) =>
      expectNoContent(getDayFlowApiClient().DELETE("/api/v1/days/{dayId}", { params: { path: { dayId } } })),
    ...useDayMutationOptions(),
  });
}