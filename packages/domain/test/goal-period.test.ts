import { describe, expect, it } from "vitest";
import {
  childPeriodOptions,
  findParentCandidates,
  isCanonicalGoalPeriod,
  monthPeriod,
  quarterPeriod,
  validateGoalCanonicalPeriod,
  weekSegmentsOfMonth,
  yearPeriod,
} from "../src";

const range = (startDate: string, endDate: string) => ({ startDate, endDate });

describe("GOAL-004 calendar periods", () => {
  it("YEAR is the whole calendar year", () => {
    expect(yearPeriod(2026)).toEqual(range("2026-01-01", "2026-12-31"));
  });

  it("QUARTER boundaries", () => {
    expect([1, 2, 3, 4].map((quarter) => quarterPeriod(2026, quarter))).toEqual([
      range("2026-01-01", "2026-03-31"),
      range("2026-04-01", "2026-06-30"),
      range("2026-07-01", "2026-09-30"),
      range("2026-10-01", "2026-12-31"),
    ]);
  });

  it("MONTH handles February in common and leap years", () => {
    expect(monthPeriod(2026, 2)).toEqual(range("2026-02-01", "2026-02-28"));
    expect(monthPeriod(2028, 2)).toEqual(range("2028-02-01", "2028-02-29"));
  });

  it("offers only the months of the parent quarter", () => {
    expect(childPeriodOptions({ type: "QUARTER", startDate: "2026-04-01" })).toEqual([
      monthPeriod(2026, 4),
      monthPeriod(2026, 5),
      monthPeriod(2026, 6),
    ]);
    expect(childPeriodOptions({ type: "YEAR", startDate: "2026-01-01" })).toHaveLength(4);
    expect(childPeriodOptions({ type: "WEEK", startDate: "2026-09-14" })).toEqual([]);
  });

  it("WEEK segments of September 2026 start on Monday and are cut at the month (partial first and last week)", () => {
    expect(weekSegmentsOfMonth(2026, 9)).toEqual([
      { week: 1, ...range("2026-09-01", "2026-09-06") },
      { week: 2, ...range("2026-09-07", "2026-09-13") },
      { week: 3, ...range("2026-09-14", "2026-09-20") },
      { week: 4, ...range("2026-09-21", "2026-09-27") },
      { week: 5, ...range("2026-09-28", "2026-09-30") },
    ]);
  });

  it("a month starting on Monday has a full first week; a month ending on Sunday has a full last week", () => {
    // June 2026 starts on Monday; May 2026 ends on Sunday.
    expect(weekSegmentsOfMonth(2026, 6)[0]).toEqual({ week: 1, ...range("2026-06-01", "2026-06-07") });
    expect(weekSegmentsOfMonth(2026, 5).at(-1)).toEqual({ week: 5, ...range("2026-05-25", "2026-05-31") });
    // February 2027 starts on Monday and ends on Sunday: exactly four full weeks.
    expect(weekSegmentsOfMonth(2027, 2).map((week) => [week.startDate, week.endDate])).toEqual([
      ["2027-02-01", "2027-02-07"],
      ["2027-02-08", "2027-02-14"],
      ["2027-02-15", "2027-02-21"],
      ["2027-02-22", "2027-02-28"],
    ]);
  });

  it("accepts only canonical ranges", () => {
    expect(isCanonicalGoalPeriod("YEAR", range("2026-01-01", "2026-12-31"))).toBe(true);
    expect(isCanonicalGoalPeriod("YEAR", range("2026-01-02", "2026-12-31"))).toBe(false);
    expect(isCanonicalGoalPeriod("QUARTER", range("2026-01-01", "2026-12-31"))).toBe(false);
    expect(isCanonicalGoalPeriod("MONTH", range("2026-02-01", "2026-02-29"))).toBe(false);
    expect(isCanonicalGoalPeriod("WEEK", range("2026-09-28", "2026-09-30"))).toBe(true);
    expect(isCanonicalGoalPeriod("WEEK", range("2026-09-28", "2026-10-04"))).toBe(false);
    expect(isCanonicalGoalPeriod("WEEK", range("2026-02-30", "2026-03-01"))).toBe(false);
    expect(validateGoalCanonicalPeriod({ type: "QUARTER", ...range("2026-01-01", "2026-12-31") })[0]?.code).toBe(
      "INVALID_GOAL_PERIOD",
    );
  });

  it("finds only parents of the directly higher type that contain the period", () => {
    const goals = [
      { id: "y1", type: "YEAR" as const, ...range("2026-01-01", "2026-12-31") },
      { id: "q3", type: "QUARTER" as const, ...range("2026-07-01", "2026-09-30") },
      { id: "q3b", type: "QUARTER" as const, ...range("2026-07-01", "2026-09-30") },
      { id: "m9", type: "MONTH" as const, ...range("2026-09-01", "2026-09-30") },
    ];
    expect(findParentCandidates(goals, "MONTH", monthPeriod(2026, 9)).map((goal) => goal.id)).toEqual(["q3", "q3b"]);
    expect(findParentCandidates(goals, "WEEK", range("2026-09-14", "2026-09-20")).map((goal) => goal.id)).toEqual(["m9"]);
    expect(findParentCandidates(goals, "MONTH", monthPeriod(2026, 3))).toEqual([]);
    expect(findParentCandidates(goals, "YEAR", yearPeriod(2026))).toEqual([]);
  });
});
