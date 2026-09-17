import type { CreateDayRequest, SaveReviewRequest } from "@dayflow/api-client";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { ApiError, expectData, isStaleDataError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { archiveQuery, nextArchivePage, type ArchiveTypeFilter } from "./review-archive";
import type { ReviewType } from "./review-period";

/** The saved review of a period, or null when none was saved yet (404 REVIEW_NOT_FOUND). */
export function useReview(type: ReviewType, periodStart: string) {
  return useQuery({
    queryKey: queryKeys.reviews.period(type, periodStart),
    queryFn: async () => {
      try {
        return await expectData(
          getDayFlowApiClient().GET("/api/v1/reviews/{type}/{periodStart}", {
            params: { path: { type, periodStart } },
          }),
        );
      } catch (error) {
        if (error instanceof ApiError && error.problem?.code === "REVIEW_NOT_FOUND") return null;
        throw error;
      }
    },
  });
}

/**
 * Review archive pages (server-side filter, search and paging). A changed filter or search is another
 * query key, so it always starts again at page 0.
 */
export function useReviewArchive(filter: { type: ArchiveTypeFilter; q: string }) {
  return useInfiniteQuery({
    queryKey: queryKeys.reviews.archive(filter.type, filter.q),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      expectData(getDayFlowApiClient().GET("/api/v1/reviews", { params: { query: archiveQuery(filter, pageParam) } })),
    getNextPageParam: nextArchivePage,
  });
}

/** Saves rating, completion and the whole KPT list with expectedVersion (null for a first save). */
export function useSaveReview(type: ReviewType, periodStart: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.reviews.period(type, periodStart);
  return useMutation({
    mutationFn: (body: SaveReviewRequest) =>
      expectData(
        getDayFlowApiClient().PUT("/api/v1/reviews/{type}/{periodStart}", {
          params: { path: { type, periodStart } },
          body,
        }),
      ),
    onSuccess: (review) => {
      queryClient.setQueryData(key, review);
      // Counts, preview and search matches of the archive may have changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.archiveAll });
    },
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
      expectData(
        getDayFlowApiClient().POST("/api/v1/review-items/{itemId}/convert", { params: { path: { itemId } }, body }),
      ),
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.reviews.period(type, periodStart), result.review);
      await queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
    },
  });
}
