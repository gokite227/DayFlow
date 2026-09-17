import type { components } from "./generated/schema";

// Named aliases for the generated OpenAPI schemas. Never edit the generated file;
// regenerate it from the Spring Boot spec instead (see README.md).
type Schemas = components["schemas"];

export type AuthTokenResponse = Schemas["AuthTokenResponse"];
export type ExchangeCodeRequest = Schemas["ExchangeCodeRequest"];
export type RefreshTokenRequest = Schemas["RefreshTokenRequest"];
export type LogoutRequest = Schemas["LogoutRequest"];
export type MeResponse = Schemas["MeResponse"];

export type GoalResponse = Schemas["GoalResponse"];
export type CalendarGoalResponse = GoalResponse & {
  kind: "CALENDAR";
  type: Exclude<GoalResponse["type"], null>;
};
export type CreateGoalRequest = Schemas["CreateGoalRequest"];
export type UpdateGoalRequest = Schemas["UpdateGoalRequest"];

/** An independent date-range Goal: no calendar type and no parent. */
export type PeriodGoalResponse = GoalResponse & { kind: "PERIOD"; type: null; parentGoalId: null };

/** Calendar Goal screens (YEAR → WEEK hierarchy) only work with CALENDAR Goals. */
export function isCalendarGoalResponse(goal: GoalResponse): goal is CalendarGoalResponse {
  return goal.kind === "CALENDAR" && goal.type !== null;
}

export function isPeriodGoalResponse(goal: GoalResponse): goal is PeriodGoalResponse {
  return goal.kind === "PERIOD";
}

export type DayResponse = Schemas["DayResponse"];
export type CreateDayRequest = Schemas["CreateDayRequest"];
export type UpdateDayRequest = Schemas["UpdateDayRequest"];

export type DayPriority = DayResponse["priority"];

export type DayTagResponse = Schemas["DayTagResponse"];
export type CreateDayTagRequest = Schemas["CreateDayTagRequest"];
export type UpdateDayTagRequest = Schemas["UpdateDayTagRequest"];

export type DayScheduleResponse = Schemas["DayScheduleResponse"];
export type SetDayScheduleRequest = Schemas["SetDayScheduleRequest"];

export type ReviewResponse = Schemas["ReviewResponse"];
export type ReviewItemResponse = Schemas["ReviewItemResponse"];
export type SaveReviewRequest = Schemas["SaveReviewRequest"];
export type ReviewItemRequest = Schemas["ReviewItemRequest"];
export type ConvertReviewItemResponse = Schemas["ConvertReviewItemResponse"];
export type ReviewArchiveEntry = Schemas["ReviewArchiveEntry"];
export type ReviewArchivePage = Schemas["ReviewArchivePage"];

export type ApplyRecoveryRequest = Schemas["ApplyRecoveryRequest"];
export type RecoveryDecisionRequest = Schemas["RecoveryDecisionRequest"];
export type ApplyRecoveryResponse = Schemas["ApplyRecoveryResponse"];
export type RecoveryDayResponse = Schemas["RecoveryDayResponse"];
export type SaveRecoveryDayRequest = Schemas["SaveRecoveryDayRequest"];
export type RecoveryCandidateResponse = Schemas["RecoveryCandidateResponse"];
export type RecoveryEventResponse = Schemas["RecoveryEventResponse"];
export type RecoveryEventItemResponse = Schemas["RecoveryEventItemResponse"];
export type CarryOverPreviewRequest = Schemas["CarryOverPreviewRequest"];
export type CarryOverPreviewResponse = Schemas["CarryOverPreviewResponse"];
export type ApplyCarryOverRequest = Schemas["ApplyCarryOverRequest"];
export type ApplyCarryOverResponse = Schemas["ApplyCarryOverResponse"];

export type EventResponse = Schemas["EventResponse"];
export type EventOccurrenceResponse = Schemas["EventOccurrenceResponse"];
export type CreateEventRequest = Schemas["CreateEventRequest"];
export type UpdateEventRequest = Schemas["UpdateEventRequest"];
export type EventCategoryResponse = Schemas["EventCategoryResponse"];
export type EventCategorySummary = Schemas["EventCategorySummary"];
export type CreateEventCategoryRequest = Schemas["CreateEventCategoryRequest"];
export type UpdateEventCategoryRequest = Schemas["UpdateEventCategoryRequest"];
export type EventRecurrence = EventResponse["recurrence"];

/** AI Today Coach. Suggestions are proposals only; applying one is a normal Day PATCH after user confirmation. */
export type TodayCoachRequest = Schemas["TodayCoachRequest"];
export type TodayCoachResponse = Schemas["TodayCoachResponse"];
export type CoachPriority = Schemas["CoachPriority"];
export type CoachObservation = Schemas["CoachObservation"];
export type CoachEvidence = Schemas["CoachEvidence"];
export type CoachSuggestion = Schemas["CoachSuggestion"];

/**
 * The generated schemas list the timed and all-day fields as independent nullables. The server
 * always sends exactly one pair (requirements §8.4); these types express that correlation.
 */
export type TimedEventTime = { allDay: false; startAt: string; endAt: string; startDate: null; endDateExclusive: null };
export type AllDayEventTime = { allDay: true; startAt: null; endAt: null; startDate: string; endDateExclusive: string };
export type EventTime = TimedEventTime | AllDayEventTime;

/** Problem Details body of every 4xx error (application/problem+json). */
export type ProblemResponse = Schemas["ProblemResponse"];
export type FieldViolation = Schemas["FieldViolation"];
