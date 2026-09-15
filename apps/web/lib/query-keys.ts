import type { paths } from "@dayflow/api-client";

export type GoalListFilters = NonNullable<paths["/api/v1/goals"]["get"]["parameters"]["query"]>;
export type DayListFilters = NonNullable<paths["/api/v1/days"]["get"]["parameters"]["query"]>;

/**
 * Query keys are hierarchical so a mutation can invalidate every list of a resource
 * with `queryKeys.goals.all` / `queryKeys.days.all`.
 */
export const queryKeys = {
  goals: {
    all: ["goals"] as const,
    list: (filters: GoalListFilters = {}) => ["goals", "list", filters] as const,
  },
  days: {
    all: ["days"] as const,
    list: (filters: DayListFilters = {}) => ["days", "list", filters] as const,
  },
  events: {
    all: ["events"] as const,
    list: () => ["events", "list"] as const,
    detail: (eventId: string) => ["events", "detail", eventId] as const,
    occurrences: (from: string, to: string) => ["events", "occurrences", from, to] as const,
  },
  reviews: {
    all: ["reviews"] as const,
    period: (type: string, periodStart: string) => ["reviews", type, periodStart] as const,
  },
  recoveryDays: {
    all: ["recovery-days"] as const,
    range: (from: string, to: string) => ["recovery-days", from, to] as const,
  },
};
