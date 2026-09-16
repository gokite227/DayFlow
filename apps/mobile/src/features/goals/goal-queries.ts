import { useQuery } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";

export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals.list(),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/goals", { params: { query: {} } })),
  });
}