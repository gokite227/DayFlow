import type { DayResponse, CalendarGoalResponse as GoalResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { overlaps, reviewPeriod, shiftAnchor } from "./review-period";
import { formatRate, goalSubtreeIds, isOpen, summarizeDays, summarizeGoal } from "./review-summary";

const day = (overrides: Partial<DayResponse>): DayResponse => ({
  id: "day",
  goalId: "week",
  title: "Day",
  status: "NOT_STARTED",
  priority: "LOW",
  tags: [],
  estimatedMinutes: 60,
  plannedDate: "2026-09-15",
  planningMode: "ANYTIME",
  carriedFromDayId: null,
  coreDay: false,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 0,
  schedule: null,
  ...overrides,
});

const goal = (id: string, type: GoalResponse["type"], parentGoalId: string | null): GoalResponse => ({
  id,
  kind: "CALENDAR",
  type,
  parentGoalId,
  title: id,
  why: "",
  startDate: "2026-09-14",
  endDate: "2026-09-20",
  priority: 1,
  progressPolicy: "AUTO",
  continuedFromGoalId: null,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 0,
});

describe("REV-001 review periods", () => {
  it("computes each period containing the anchor", () => {
    expect(reviewPeriod("DAY", "2026-09-16")).toMatchObject({ start: "2026-09-16", end: "2026-09-16" });
    expect(reviewPeriod("WEEK", "2026-09-16")).toMatchObject({ start: "2026-09-14", end: "2026-09-20" });
    expect(reviewPeriod("MONTH", "2026-02-10")).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
    expect(reviewPeriod("QUARTER", "2026-09-16")).toMatchObject({ start: "2026-07-01", end: "2026-09-30", label: "2026 Q3" });
    expect(reviewPeriod("YEAR", "2026-09-16")).toMatchObject({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("moves to the previous and next period", () => {
    expect(shiftAnchor("DAY", "2026-09-01", -1)).toBe("2026-08-31");
    expect(shiftAnchor("WEEK", "2026-09-16", 1)).toBe("2026-09-23");
    expect(shiftAnchor("MONTH", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("QUARTER", "2026-11-05", 1)).toBe("2027-02-01");
    expect(shiftAnchor("YEAR", "2026-09-16", -1)).toBe("2025-09-01");
  });

  it("matches goals that overlap the period", () => {
    const week = reviewPeriod("WEEK", "2026-09-16");
    expect(overlaps({ startDate: "2026-09-01", endDate: "2026-09-14" }, week)).toBe(true);
    expect(overlaps({ startDate: "2026-09-21", endDate: "2026-09-27" }, week)).toBe(false);
  });
});

describe("REV-002 review summary", () => {
  it("counts only exact values and leaves let-go Days out of the completion rate", () => {
    const summary = summarizeDays([
      day({ id: "a", status: "DONE", coreDay: true }),
      day({ id: "b", status: "IN_PROGRESS", coreDay: true }),
      day({ id: "c", status: "SKIPPED" }),
      day({ id: "d", status: "DEFERRED" }),
    ]);
    expect(summary).toEqual({ total: 4, done: 1, open: 2, skipped: 1, completionRate: 1 / 3, coreTotal: 2, coreDone: 1 });
    expect(formatRate(summary.completionRate)).toBe("33%");
  });

  it("has no completion rate without countable Days", () => {
    expect(summarizeDays([]).completionRate).toBeNull();
    expect(summarizeDays([day({ status: "SKIPPED" })]).completionRate).toBeNull();
    expect(formatRate(null)).toBe("–");
  });

  it("treats NOT_STARTED, IN_PROGRESS and DEFERRED as open", () => {
    expect(["NOT_STARTED", "IN_PROGRESS", "DEFERRED", "DONE", "SKIPPED"].map((status) => isOpen({ status } as DayResponse))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("summarizes a goal through its descendant goals", () => {
    const goals = [goal("month", "MONTH", null), goal("week-1", "WEEK", "month"), goal("week-2", "WEEK", "month"), goal("other", "WEEK", null)];
    expect([...goalSubtreeIds(goals, "month")].sort()).toEqual(["month", "week-1", "week-2"]);
    const days = [day({ goalId: "week-1", status: "DONE" }), day({ goalId: "week-2" }), day({ goalId: "other", status: "DONE" })];
    expect(summarizeGoal(goals, days, "month")).toMatchObject({ total: 2, done: 1, open: 1 });
  });
});
