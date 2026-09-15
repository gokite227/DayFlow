// Type-level contract checks, verified by `pnpm typecheck` (never executed).
// If the Spring API or its OpenAPI document changes, regenerate and update these.
import type {
  DayFlowApiClient,
  DayResponse,
  DayScheduleResponse,
  EventOccurrenceResponse,
  EventResponse,
  EventTime,
  GoalResponse,
  UpdateEventRequest,
  ProblemResponse,
  SetDayScheduleRequest,
  UpdateDayRequest,
  UpdateGoalRequest,
  paths,
} from "../src";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type IsRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;
type SuccessStatus<R> = Extract<keyof R, 200 | 201 | 204>;
type ErrorStatus<R> = Extract<keyof R, 400 | 404 | 409>;

// Status codes: POST 201, DELETE 204, GET/PATCH/PUT 200.
export type StatusCodes = [
  Expect<Equal<SuccessStatus<paths["/api/v1/goals"]["post"]["responses"]>, 201>>,
  Expect<Equal<SuccessStatus<paths["/api/v1/days"]["post"]["responses"]>, 201>>,
  Expect<Equal<SuccessStatus<paths["/api/v1/goals/{goalId}"]["delete"]["responses"]>, 204>>,
  Expect<Equal<SuccessStatus<paths["/api/v1/days/{dayId}"]["delete"]["responses"]>, 204>>,
  Expect<Equal<SuccessStatus<paths["/api/v1/days/{dayId}/schedule"]["delete"]["responses"]>, 204>>,
  Expect<Equal<SuccessStatus<paths["/api/v1/days/{dayId}/schedule"]["put"]["responses"]>, 200>>,
  Expect<Equal<SuccessStatus<paths["/api/v1/goals/{goalId}"]["patch"]["responses"]>, 200>>,
  Expect<Equal<SuccessStatus<paths["/api/v1/days"]["get"]["responses"]>, 200>>,
];

// Errors: Problem Details for 400/404/409.
export type ErrorContract = [
  Expect<Equal<ErrorStatus<paths["/api/v1/goals/{goalId}"]["patch"]["responses"]>, 400 | 404 | 409>>,
  Expect<Equal<ErrorStatus<paths["/api/v1/days/{dayId}/schedule"]["put"]["responses"]>, 400 | 404 | 409>>,
  Expect<Equal<ErrorStatus<paths["/api/v1/days"]["post"]["responses"]>, 400>>,
  Expect<
    Equal<
      paths["/api/v1/goals/{goalId}"]["patch"]["responses"][409]["content"]["application/problem+json"],
      ProblemResponse
    >
  >,
  Expect<Equal<IsRequired<ProblemResponse, "code" | "fieldErrors" | "traceId" | "status" | "detail">, true>>,
];

// Response fields are always present; nullable ones are explicit `| null`.
export type ResponseNullability = [
  Expect<Equal<GoalResponse["parentGoalId"], string | null>>,
  Expect<Equal<IsRequired<GoalResponse, "parentGoalId">, true>>,
  Expect<Equal<DayResponse["plannedDate"], string | null>>,
  Expect<Equal<IsRequired<DayResponse, "plannedDate">, true>>,
  Expect<Equal<DayResponse["schedule"], DayScheduleResponse | null>>,
  Expect<Equal<IsRequired<DayResponse, "schedule">, true>>,
  Expect<Equal<GoalResponse["id"], string>>,
  Expect<Equal<GoalResponse["startDate"], string>>,
  Expect<Equal<DayScheduleResponse["startAt"], string>>,
];

// PATCH: omitted keeps the value, null clears it (plannedDate) or is a valid parent (YEAR Goals).
export type PatchNullability = [
  Expect<Equal<IsRequired<UpdateDayRequest, "plannedDate">, false>>,
  Expect<Equal<UpdateDayRequest["plannedDate"], string | null | undefined>>,
  Expect<Equal<IsRequired<UpdateGoalRequest, "parentGoalId">, false>>,
  Expect<Equal<UpdateGoalRequest["parentGoalId"], string | null | undefined>>,
  // Other PATCH fields are omit-only.
  Expect<Equal<UpdateDayRequest["title"], string | undefined>>,
];

// Events: both time pairs are always present and nullable; EventTime narrows them by allDay.
export type EventNullability = [
  Expect<Equal<SuccessStatus<paths["/api/v1/events"]["post"]["responses"]>, 201>>,
  Expect<Equal<SuccessStatus<paths["/api/v1/events/{eventId}"]["delete"]["responses"]>, 204>>,
  Expect<Equal<ErrorStatus<paths["/api/v1/events/{eventId}"]["patch"]["responses"]>, 400 | 404 | 409>>,
  Expect<Equal<EventResponse["startAt"], string | null>>,
  Expect<Equal<EventResponse["endDateExclusive"], string | null>>,
  Expect<Equal<IsRequired<EventResponse, "startAt" | "endAt" | "startDate" | "endDateExclusive">, true>>,
  Expect<Equal<EventOccurrenceResponse["startDate"], string | null>>,
  Expect<Equal<IsRequired<EventOccurrenceResponse, "startAt" | "startDate" | "linkedGoalId">, true>>,
  Expect<Equal<EventResponse["reminders"], number[]>>,
  Expect<Equal<IsRequired<UpdateEventRequest, "linkedGoalId">, false>>,
  Expect<Equal<UpdateEventRequest["linkedGoalId"], string | null | undefined>>,
  Expect<Equal<paths["/api/v1/events/{eventId}"]["delete"]["parameters"]["query"], { version: number }>>,
  Expect<Equal<keyof NonNullable<paths["/api/v1/event-occurrences"]["get"]["parameters"]["query"]>, "from" | "to" | "type">>,
  // Every EventTime variant fits the generated response fields.
  Expect<EventTime extends Pick<EventResponse, keyof EventTime> ? true : false>,
];

// expectedVersion is required (the key must be present) and nullable.
export type ExpectedVersion = [
  Expect<Equal<SetDayScheduleRequest["expectedVersion"], number | null>>,
  Expect<Equal<IsRequired<SetDayScheduleRequest, "expectedVersion">, true>>,
];

export async function clientUsage(client: DayFlowApiClient, dayId: string): Promise<void> {
  const created = await client.POST("/api/v1/goals", {
    body: {
      parentGoalId: null,
      type: "YEAR",
      title: "Annual goal",
      why: "Keep going",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      priority: 1,
      progressPolicy: "AUTO",
    },
  });
  const goal: GoalResponse | undefined = created.data;
  const problem: ProblemResponse | undefined = created.error;
  void goal;
  void problem;

  const cleared = await client.PATCH("/api/v1/days/{dayId}", {
    params: { path: { dayId } },
    body: { plannedDate: null, version: 1 },
  });
  const day: DayResponse | undefined = cleared.data;
  void day;

  await client.PUT("/api/v1/days/{dayId}/schedule", {
    params: { path: { dayId } },
    body: {
      startAt: "2026-09-15T19:00:00+09:00",
      endAt: "2026-09-15T20:00:00+09:00",
      timezone: "Asia/Seoul",
      expectedVersion: null,
    },
  });

  await client.PUT("/api/v1/days/{dayId}/schedule", {
    params: { path: { dayId } },
    // @ts-expect-error expectedVersion must be present, even when it is null.
    body: {
      startAt: "2026-09-15T19:00:00+09:00",
      endAt: "2026-09-15T20:00:00+09:00",
      timezone: "Asia/Seoul",
    },
  });

  const removed = await client.DELETE("/api/v1/days/{dayId}/schedule", { params: { path: { dayId } } });
  const noContent: undefined = removed.data;
  void noContent;
}
