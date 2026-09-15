import type { CreateGoalRequest, UpdateGoalRequest } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent } from "@/lib/api-error";
import { queryKeys, type GoalListFilters } from "@/lib/query-keys";

export function useGoals(filters: GoalListFilters = {}) {
  return useQuery({
    queryKey: queryKeys.goals.list(filters),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/goals", { params: { query: filters } })),
  });
}

// Mutations wait for the refetch (invalidate) so pending state covers the list update.

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGoalRequest) => expectData(getDayFlowApiClient().POST("/api/v1/goals", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals.all }),
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, body }: { goalId: string; body: UpdateGoalRequest }) =>
      expectData(getDayFlowApiClient().PATCH("/api/v1/goals/{goalId}", { params: { path: { goalId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals.all }),
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) =>
      expectNoContent(getDayFlowApiClient().DELETE("/api/v1/goals/{goalId}", { params: { path: { goalId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals.all }),
  });
}
