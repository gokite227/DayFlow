import type { CreateEventCategoryRequest, UpdateEventCategoryRequest } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent, isStaleDataError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";

/** EVT-006 Event Categories. Events carry their Category in the response, so changes invalidate Events too. */
export function useEventCategories() {
  return useQuery({
    queryKey: queryKeys.eventCategories.list(),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/event-categories", {})),
  });
}

function useCategoryMutationOptions() {
  const queryClient = useQueryClient();
  return {
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.eventCategories.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
    onError: (error: unknown) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: queryKeys.eventCategories.all });
    },
  };
}

export function useCreateEventCategory() {
  return useMutation({
    mutationFn: (body: CreateEventCategoryRequest) =>
      expectData(getDayFlowApiClient().POST("/api/v1/event-categories", { body })),
    ...useCategoryMutationOptions(),
  });
}

export function useUpdateEventCategory() {
  return useMutation({
    mutationFn: ({ categoryId, body }: { categoryId: string; body: UpdateEventCategoryRequest }) =>
      expectData(
        getDayFlowApiClient().PATCH("/api/v1/event-categories/{categoryId}", { params: { path: { categoryId } }, body }),
      ),
    ...useCategoryMutationOptions(),
  });
}

/** Deleting a Category keeps its Events; they become uncategorized. */
export function useDeleteEventCategory() {
  return useMutation({
    mutationFn: (categoryId: string) =>
      expectNoContent(
        getDayFlowApiClient().DELETE("/api/v1/event-categories/{categoryId}", { params: { path: { categoryId } } }),
      ),
    ...useCategoryMutationOptions(),
  });
}
