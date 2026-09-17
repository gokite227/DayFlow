import type { CreateDayRequest, DayResponse, UpdateDayRequest } from "@dayflow/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent, isStaleDataError } from "@/lib/api-error";
import { deviceTimeZone } from "@/lib/dates";
import { queryKeys, type DayListFilters } from "@/lib/query-keys";
import { scheduleRequest } from "../calendar/calendar-grid";
import type { SchedulePlan } from "./day-schedule-values";

export function useDays(filters: DayListFilters = {}) {
  return useQuery({
    queryKey: queryKeys.days.list(filters),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/days", { params: { query: filters } })),
  });
}

export function useDayTags() {
  return useQuery({
    queryKey: queryKeys.dayTags.list(),
    queryFn: () => expectData(getDayFlowApiClient().GET("/api/v1/day-tags", {})),
  });
}

function useDayMutationOptions() {
  const queryClient = useQueryClient();
  return {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.days.all }),
    onError: (error: unknown) => {
      if (isStaleDataError(error)) void queryClient.invalidateQueries({ queryKey: queryKeys.days.all });
    },
  };
}

export function useCreateDay() {
  return useMutation({
    mutationFn: (body: CreateDayRequest) => expectData(getDayFlowApiClient().POST("/api/v1/days", { body })),
    ...useDayMutationOptions(),
  });
}

export function useUpdateDay() {
  return useMutation({
    mutationFn: ({ dayId, body }: { dayId: string; body: UpdateDayRequest }) =>
      expectData(getDayFlowApiClient().PATCH("/api/v1/days/{dayId}", { params: { path: { dayId } }, body })),
    ...useDayMutationOptions(),
  });
}

export function useDeleteDay() {
  return useMutation({
    mutationFn: (dayId: string) =>
      expectNoContent(getDayFlowApiClient().DELETE("/api/v1/days/{dayId}", { params: { path: { dayId } } })),
    ...useDayMutationOptions(),
  });
}
/** A new Day was created, but its time placement failed: the screen continues on the created Day. */
export class DayScheduleSaveError extends Error {
  constructor(
    readonly day: DayResponse,
    readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : "시간 배치를 저장하지 못했어요.");
  }
}

/**
 * Day detail save: the Day (POST or PATCH), then — only when the times really changed — its time placement (PUT with
 * the version from the saved Day, or DELETE). One mutation, so the follow-up request finishes even though the form
 * re-renders when the Day list refreshes.
 */
export function useSaveDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dayId, create, update, schedule }: { dayId: string | null; create?: CreateDayRequest; update?: UpdateDayRequest; schedule: SchedulePlan }) => {
      const client = getDayFlowApiClient();
      const saved = dayId
        ? await expectData(client.PATCH("/api/v1/days/{dayId}", { params: { path: { dayId } }, body: update! }))
        : await expectData(client.POST("/api/v1/days", { body: create! }));
      try {
        if (schedule.type === "set") {
          const body = scheduleRequest(schedule.date, schedule.startMinutes, schedule.lengthMinutes, saved.schedule, saved.schedule?.timezone ?? deviceTimeZone());
          return await expectData(client.PUT("/api/v1/days/{dayId}/schedule", { params: { path: { dayId: saved.id } }, body }));
        }
        if (schedule.type === "remove" && saved.schedule) {
          await expectNoContent(client.DELETE("/api/v1/days/{dayId}/schedule", { params: { path: { dayId: saved.id } } }));
        }
      } catch (error) {
        if (!dayId) throw new DayScheduleSaveError(saved, error);
        throw error;
      }
      return saved;
    },
    // Refresh after success and after any failure: a failed time placement may follow a saved (or created) Day.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.days.all }),
  });
}
