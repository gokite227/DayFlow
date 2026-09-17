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
    /** CALENDAR Goals (YEAR → WEEK) with optional filters. */
    list: (filters: GoalListFilters = {}) => ["goals", "list", filters] as const,
    /** Every PERIOD Goal; status and filters are derived on the client. */
    periodList: () => ["goals", "period"] as const,
    detail: (goalId: string) => ["goals", "detail", goalId] as const,
  },
  days: {
    all: ["days"] as const,
    list: (filters: DayListFilters = {}) => ["days", "list", filters] as const,
    /** Derived from Days, so any Day mutation (which invalidates "days") refreshes it too. */
    recoveryCandidates: (today: string) => ["days", "recovery-candidates", today] as const,
  },
  /** Carry Over previews read Days and Goals; they are refetched on demand and after an apply. */
  carryOverPreview: (body: unknown) => ["carry-over-preview", body] as const,
  recoveryEvents: {
    all: ["recovery-events"] as const,
    list: (limit: number) => ["recovery-events", limit] as const,
  },
  dayTags: {
    all: ["day-tags"] as const,
    list: () => ["day-tags", "list"] as const,
  },
  eventCategories: {
    all: ["event-categories"] as const,
    list: () => ["event-categories", "list"] as const,
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
    /** Every archive list (any filter); a saved review refreshes them all. */
    archiveAll: ["reviews", "archive"] as const,
    /** One archive list: its pages are kept together by useInfiniteQuery. */
    archive: (type: string, q: string) => ["reviews", "archive", { type, q }] as const,
  },
  recoveryDays: {
    all: ["recovery-days"] as const,
    range: (from: string, to: string) => ["recovery-days", from, to] as const,
  },
};
