import { isCalendarGoalResponse, type CreateGoalRequest, type UpdateGoalRequest } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent } from "@/lib/api-error";
import { queryKeys, type GoalListFilters } from "@/lib/query-keys";

export function useGoals(filters: GoalListFilters = {}) {
  return useQuery({
    queryKey: queryKeys.goals.list(filters),
    queryFn: async () => {
      const goals = await expectData(getDayFlowApiClient().GET("/api/v1/goals", {
        params: { query: { ...filters, kind: "CALENDAR" } },
      }));
      return goals.filter(isCalendarGoalResponse);
    },
  });
}

// Mutations wait for the refetch (invalidate) so pending state covers the list update.

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateGoalRequest) => {
      const goal = await expectData(getDayFlowApiClient().POST("/api/v1/goals", { body }));
      if (!isCalendarGoalResponse(goal)) throw new Error("The Calendar Goal form received a non-calendar Goal.");
      return goal;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals.all }),
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ goalId, body }: { goalId: string; body: UpdateGoalRequest }) => {
      const goal = await expectData(getDayFlowApiClient().PATCH("/api/v1/goals/{goalId}", { params: { path: { goalId } }, body }));
      if (!isCalendarGoalResponse(goal)) throw new Error("The Calendar Goal form received a non-calendar Goal.");
      return goal;
    },
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
