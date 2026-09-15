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

/** Problem Details body of every 4xx error (application/problem+json). */
export type ProblemResponse = Schemas["ProblemResponse"];
export type FieldViolation = Schemas["FieldViolation"];
