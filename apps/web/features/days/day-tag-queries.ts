import type { CreateDayTagRequest, UpdateDayTagRequest } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent, isStaleDataError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";

/** DAY-005 Day Tags. Days carry their Tags in the Day response, so Tag changes invalidate Days too. */
export function useDayTags() {
  return useQuery({
    queryKey: queryKeys.dayTags.list(),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/day-tags", {})),
  });
}

function useTagMutationOptions() {
  const queryClient = useQueryClient();
  return {
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dayTags.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
    },
    onError: (error: unknown) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: queryKeys.dayTags.all });
    },
  };
}

export function useCreateDayTag() {
  return useMutation({
    mutationFn: (body: CreateDayTagRequest) =>
      expectData(getDayFlowApiClient().POST("/api/v1/day-tags", { body })),
    ...useTagMutationOptions(),
  });
}

export function useUpdateDayTag() {
  return useMutation({
    mutationFn: ({ tagId, body }: { tagId: string; body: UpdateDayTagRequest }) =>
      expectData(getDayFlowApiClient().PATCH("/api/v1/day-tags/{tagId}", { params: { path: { tagId } }, body })),
    ...useTagMutationOptions(),
  });
}

/** Deleting a Tag removes only its links; the Days stay. */
export function useDeleteDayTag() {
  return useMutation({
    mutationFn: (tagId: string) =>
      expectNoContent(getDayFlowApiClient().DELETE("/api/v1/day-tags/{tagId}", { params: { path: { tagId } } })),
    ...useTagMutationOptions(),
  });
}
