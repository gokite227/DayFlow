import type { ApplyRecoveryRequest, SaveRecoveryDayRequest } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent, isStaleDataError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";

/** Applies a confirmed KEEP/REDUCE/MOVE/DROP plan (all-or-nothing on the server). */
export function useApplyRecovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyRecoveryRequest) =>
      expectData(getDayFlowApiClient().POST("/api/v1/recovery/apply", { body })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.days.all }),
  });
}

export function useRecoveryDays(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.recoveryDays.range(from, to),
    queryFn: () =>
      expectData(getDayFlowApiClient().GET("/api/v1/recovery-days", { params: { query: { from, to } } })),
  });
}

export function useSaveRecoveryDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ date, body }: { date: string; body: SaveRecoveryDayRequest }) =>
      expectData(getDayFlowApiClient().PUT("/api/v1/recovery-days/{date}", { params: { path: { date } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.recoveryDays.all }),
    onError: (error) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: queryKeys.recoveryDays.all });
    },
  });
}

export function useDeleteRecoveryDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date: string) =>
      expectNoContent(getDayFlowApiClient().DELETE("/api/v1/recovery-days/{date}", { params: { path: { date } } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.recoveryDays.all }),
  });
}
