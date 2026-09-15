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
};
