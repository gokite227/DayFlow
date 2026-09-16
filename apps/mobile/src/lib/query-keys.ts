import type { paths } from "@dayflow/api-client";

export type DayListFilters = NonNullable<paths["/api/v1/days"]["get"]["parameters"]["query"]>;

/** Same hierarchy as the Web: a mutation invalidates every list of a resource through `all`. */
export const queryKeys = {
  goals: { all: ["goals"] as const, list: () => ["goals", "list"] as const },
  days: {
    all: ["days"] as const,
    list: (filters: DayListFilters = {}) => ["days", "list", filters] as const,
    recoveryCandidates: (today: string) => ["days", "recovery-candidates", today] as const,
  },
  dayTags: { all: ["day-tags"] as const, list: () => ["day-tags", "list"] as const },
  eventCategories: { all: ["event-categories"] as const, list: () => ["event-categories", "list"] as const },
  events: {
    all: ["events"] as const,
    list: () => ["events", "list"] as const,
    detail: (eventId: string) => ["events", "detail", eventId] as const,
    occurrences: (from: string, to: string) => ["events", "occurrences", from, to] as const,
  },
  reviews: { all: ["reviews"] as const, period: (type: string, periodStart: string) => ["reviews", type, periodStart] as const },
  carryOverPreview: (body: unknown) => ["carry-over-preview", body] as const,
  recoveryEvents: { all: ["recovery-events"] as const, list: (limit: number) => ["recovery-events", limit] as const },
  recoveryDays: { all: ["recovery-days"] as const, range: (from: string, to: string) => ["recovery-days", from, to] as const },
};