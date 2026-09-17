import { isPeriodGoalResponse, type GoalResponse, type PeriodGoalResponse } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { ApiError, expectData, expectNoContent } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { toCreatePeriodGoalRequest, toUpdatePeriodGoalRequest, type PeriodGoalFormValues } from "./period-goal-values";

/** Every PERIOD Goal of the signed-in user (the server scopes the list to the current User). */
export function usePeriodGoals() {
  return useQuery({
    queryKey: queryKeys.goals.periodList(),
    queryFn: async () => {
      const goals = await expectData(getDayFlowApiClient().GET("/api/v1/goals", { params: { query: { kind: "PERIOD" } } }));
      return goals.filter(isPeriodGoalResponse);
    },
  });
}

/** One Goal of either kind; another user's Goal is a 404 like an unknown id. */
export function useGoal(goalId: string) {
  return useQuery({
    queryKey: queryKeys.goals.detail(goalId),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/goals/{goalId}", { params: { path: { goalId } } })),
    // "Not found" is an answer, not a hiccup: show it right away.
    retry: (failures, error) => !(error instanceof ApiError && error.status === 404) && failures < 1,
  });
}

function asPeriodGoal(goal: GoalResponse): PeriodGoalResponse {
  if (!isPeriodGoalResponse(goal)) throw new Error("The Period Goal form received a CALENDAR Goal.");
  return goal;
}

// PERIOD Goals are not part of the CALENDAR lists, so only the period list and the detail are refreshed.

export function useCreatePeriodGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: PeriodGoalFormValues) =>
      asPeriodGoal(await expectData(getDayFlowApiClient().POST("/api/v1/goals", { body: toCreatePeriodGoalRequest(values) }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals.periodList() }),
  });
}

export function useUpdatePeriodGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ goal, values }: { goal: PeriodGoalResponse; values: PeriodGoalFormValues }) =>
      asPeriodGoal(
        await expectData(
          getDayFlowApiClient().PATCH("/api/v1/goals/{goalId}", {
            params: { path: { goalId: goal.id } },
            body: toUpdatePeriodGoalRequest(values, goal.version),
          }),
        ),
      ),
    onSuccess: (goal) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.goals.periodList() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.goals.detail(goal.id) }),
      ]),
    onError: (_error, { goal }) => {
      // A version conflict or a removed Goal: show the latest state.
      void queryClient.invalidateQueries({ queryKey: queryKeys.goals.detail(goal.id) });
    },
  });
}

export function useDeletePeriodGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) =>
      expectNoContent(getDayFlowApiClient().DELETE("/api/v1/goals/{goalId}", { params: { path: { goalId } } })),
    onSuccess: async (_result, goalId) => {
      queryClient.removeQueries({ queryKey: queryKeys.goals.detail(goalId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.goals.periodList() });
    },
  });
}
