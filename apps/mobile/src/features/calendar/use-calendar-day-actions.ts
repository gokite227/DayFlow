import type { DayResponse, GoalResponse } from "@dayflow/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getDayFlowApiClient } from "@/lib/api-client";
import { expectData, expectNoContent } from "@/lib/api-error";
import { deviceTimeZone, wallClock } from "@/lib/dates";
import { queryKeys } from "@/lib/query-keys";
import { applyDropToDay, dropDateProblem, scheduleRequest, type DropAction } from "./calendar-grid";

type CalendarChange = { day: DayResponse; action: Exclude<DropAction, null> };

/** The schedule keeps its own timezone when moved; a new schedule uses the device timezone. */
const timeZoneOf = (day: DayResponse) => day.schedule?.timezone ?? deviceTimeZone();

/**
 * Calendar drops and resizes. Gestures only produce one DropAction at the end; this applies it
 * optimistically to the cached full Day list (the Calendar's single source), sends the existing
 * Day/schedule API calls, and restores the snapshot if the server rejects the change.
 */
export function useCalendarDayActions(goalOf: (day: DayResponse) => Pick<GoalResponse, "kind" | "startDate" | "endDate"> | undefined = () => undefined) {
  const queryClient = useQueryClient();
  const listKey = queryKeys.days.list({});
  // A drop the Day's Goal period cannot take is refused before the optimistic update, so nothing moves.
  const [problem, setProblem] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ day, action }: CalendarChange) => {
      const client = getDayFlowApiClient();
      switch (action.type) {
        case "setSchedule":
          await expectData(
            client.PUT("/api/v1/days/{dayId}/schedule", {
              params: { path: { dayId: day.id } },
              body: scheduleRequest(action.date, action.startMinutes, action.lengthMinutes, day.schedule, timeZoneOf(day)),
            }),
          );
          return;
        case "unschedule":
          await expectNoContent(client.DELETE("/api/v1/days/{dayId}/schedule", { params: { path: { dayId: day.id } } }));
          if (action.moveToDate) {
            await expectData(client.PATCH("/api/v1/days/{dayId}", { params: { path: { dayId: day.id } }, body: { plannedDate: action.moveToDate, version: day.version } }));
          }
          return;
        case "moveDate":
          await expectData(client.PATCH("/api/v1/days/{dayId}", { params: { path: { dayId: day.id } }, body: { plannedDate: action.date, version: day.version } }));
      }
    },
    onMutate: async ({ day, action }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<DayResponse[]>(listKey);
      queryClient.setQueryData<DayResponse[]>(listKey, (days) => days?.map((candidate) => (candidate.id === day.id ? applyDropToDay(candidate, action, timeZoneOf(day)) : candidate)));
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.days.all }),
  });

  const resize = (day: DayResponse, lengthMinutes: number) => {
    if (!day.schedule) return;
    const start = wallClock(day.schedule.startAt);
    setProblem(null);
    mutation.mutate({ day, action: { type: "setSchedule", date: start.date, startMinutes: start.minutes, lengthMinutes } });
  };

  return {
    apply: (day: DayResponse, action: DropAction) => {
      if (action === null) return;
      const refusal = dropDateProblem(goalOf(day), action);
      setProblem(refusal);
      if (refusal === null) mutation.mutate({ day, action });
    },
    resize,
    pending: mutation.isPending,
    error: mutation.error,
    problem,
    reset: () => {
      setProblem(null);
      mutation.reset();
    },
  };
}
