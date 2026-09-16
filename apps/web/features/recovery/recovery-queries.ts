import type {
  ApplyCarryOverRequest,
  ApplyRecoveryRequest,
  CarryOverPreviewRequest,
  SaveRecoveryDayRequest,
} from "@dayflow/api-client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent, isStaleDataError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";

/**
 * REC-001 missed Days as of the user's today and now. The key lives under "days", so every Day change
 * refreshes it; "now" is taken when fetching, and the list is refreshed every minute for timed Days.
 */
export function useRecoveryCandidates(today: string) {
  return useQuery({
    queryKey: queryKeys.days.recoveryCandidates(today),
    queryFn: () =>
      expectData(
        getDayFlowApiClient().GET("/api/v1/recovery/candidates", {
          params: { query: { today, now: new Date().toISOString() } },
        }),
      ),
    refetchInterval: 60_000,
  });
}

/** Applies a confirmed KEEP/REDUCE/MOVE/DROP plan (all-or-nothing on the server). */
export function useApplyRecovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyRecoveryRequest) =>
      expectData(getDayFlowApiClient().POST("/api/v1/recovery/apply", { body })),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.recoveryEvents.all });
    },
  });
}

/** REC-004 preview: a read-only POST, so it is a query keyed by everything the user chose. */
export function useCarryOverPreview(body: CarryOverPreviewRequest | null) {
  return useQuery({
    queryKey: queryKeys.carryOverPreview(body),
    queryFn: () => expectData(getDayFlowApiClient().POST("/api/v1/recovery/carry-over/preview", { body: body! })),
    enabled: body !== null,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 0,
  });
}

/** REC-003 apply. A 409 means the plan changed after the preview: Days, Goals and the preview reload. */
export function useApplyCarryOver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyCarryOverRequest) =>
      expectData(getDayFlowApiClient().POST("/api/v1/recovery/carry-over/apply", { body })),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.recoveryEvents.all });
      void queryClient.invalidateQueries({ queryKey: ["carry-over-preview"] });
    },
  });
}

/** REC-005 history, newest first. */
export function useRecoveryEvents(limit = 30) {
  return useQuery({
    queryKey: queryKeys.recoveryEvents.list(limit),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/recovery/events", { params: { query: { limit } } })),
  });
}

export function useRecoveryDays(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.recoveryDays.range(from, to),
    queryFn: () =>
      expectData(getDayFlowApiClient().GET("/api/v1/recovery-days", { params: { query: { from, to } } })),
  });
}

/** Saves a recovery day and releases the chosen core Days in one server transaction. */
export function useSaveRecoveryDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ date, body }: { date: string; body: SaveRecoveryDayRequest }) =>
      expectData(getDayFlowApiClient().PUT("/api/v1/recovery-days/{date}", { params: { path: { date } }, body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recoveryDays.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
    },
    onError: (error) => {
      if (isStaleDataError(error)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.recoveryDays.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
      }
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
