import type { DayResponse, GoalResponse } from "@dayflow/api-client";

/** Response fixtures for helper tests. */
export function goalFixture(overrides: Partial<GoalResponse>): GoalResponse {
  return {
    id: "g",
    parentGoalId: null,
    continuedFromGoalId: null,
    kind: "CALENDAR",
    type: "YEAR",
    title: "Goal",
    why: "",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    priority: 1,
    progressPolicy: "AUTO",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 0,
    ...overrides,
  };
}

export function dayFixture(overrides: Partial<DayResponse>): DayResponse {
  return {
    id: "d",
    goalId: null,
    carriedFromDayId: null,
    title: "Day",
    status: "NOT_STARTED",
    priority: "NONE",
    estimatedMinutes: 60,
    plannedDate: null,
    planningMode: "ANYTIME",
    coreDay: false,
    schedule: null,
    tags: [],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    version: 0,
    ...overrides,
  };
}
