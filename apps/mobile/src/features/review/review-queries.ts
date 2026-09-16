import type { CreateDayRequest, SaveReviewRequest } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { ApiError, expectData, isStaleDataError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import type { ReviewType } from "./review-helpers";

/** The saved review, or null before the first save (404 REVIEW_NOT_FOUND). */
export function useReview(type: ReviewType, periodStart: string) {
  return useQuery({
    queryKey: queryKeys.reviews.period(type, periodStart),
    queryFn: async () => {
      try {
        return await expectData(getDayFlowApiClient().GET("/api/v1/reviews/{type}/{periodStart}", { params: { path: { type, periodStart } } }));
      } catch (error) {
        if (error instanceof ApiError && error.problem?.code === "REVIEW_NOT_FOUND") return null;
        throw error;
      }
    },
  });
}

export function useSaveReview(type: ReviewType, periodStart: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.reviews.period(type, periodStart);
  return useMutation({
    mutationFn: (body: SaveReviewRequest) =>
      expectData(getDayFlowApiClient().PUT("/api/v1/reviews/{type}/{periodStart}", { params: { path: { type, periodStart } }, body })),
    onSuccess: (review) => queryClient.setQueryData(key, review),
    onError: (error) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Try → Day (REV-004). The server returns the existing Day if the item was already converted. */
export function useConvertTryItem(type: ReviewType, periodStart: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: CreateDayRequest }) =>
      expectData(getDayFlowApiClient().POST("/api/v1/review-items/{itemId}/convert", { params: { path: { itemId } }, body })),
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.reviews.period(type, periodStart), result.review);
      await queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
    },
  });
}