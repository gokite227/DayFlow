import type { components } from "./generated/schema";

// Named aliases for the generated OpenAPI schemas. Never edit the generated file;
// regenerate it from the Spring Boot spec instead (see README.md).
type Schemas = components["schemas"];

export type GoalResponse = Schemas["GoalResponse"];
export type CreateGoalRequest = Schemas["CreateGoalRequest"];
export type UpdateGoalRequest = Schemas["UpdateGoalRequest"];

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
export type EventType = EventResponse["type"];
export type EventRecurrence = EventResponse["recurrence"];

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
