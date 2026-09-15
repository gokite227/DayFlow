import type { GoalResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { childPeriodChoices, goalPeriodLabel, periodChoicesInYear, resolveParent } from "./goal-period";

function goal(id: string, type: GoalResponse["type"], startDate: string, endDate: string, parentGoalId: string | null = null): GoalResponse {
  return {
    id,
    parentGoalId,
    type,
    title: `${id} title`,
    why: "",
    startDate,
    endDate,
    priority: 1,
    progressPolicy: "AUTO",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 0,
  };
}

const year = goal("y2026", "YEAR", "2026-01-01", "2026-12-31");
const q3 = goal("q3", "QUARTER", "2026-07-01", "2026-09-30", "y2026");
const q3b = goal("q3b", "QUARTER", "2026-07-01", "2026-09-30", "y2026");
const september = goal("m9", "MONTH", "2026-09-01", "2026-09-30", "q3");

describe("GOAL-004 derived period labels", () => {
  it("labels each type separately from the title", () => {
    expect(goalPeriodLabel(year)).toBe("2026");
    expect(goalPeriodLabel(q3)).toBe("3분기");
    expect(goalPeriodLabel(q3, true)).toBe("2026 3분기");
    expect(goalPeriodLabel(september)).toBe("9월");
    expect(goalPeriodLabel(september, true)).toBe("2026년 9월");
    expect(goalPeriodLabel({ type: "WEEK", startDate: "2026-09-14", endDate: "2026-09-20" })).toBe("9월 3주");
    expect(goalPeriodLabel({ type: "WEEK", startDate: "2026-09-28", endDate: "2026-09-30" })).toBe("9월 5주");
  });

  it("falls back to the date range for a non-canonical legacy Goal", () => {
    expect(goalPeriodLabel({ type: "QUARTER", startDate: "2026-01-01", endDate: "2026-12-31" })).toBe("1/1 ~ 12/31");
  });

  it("offers child periods of the parent only", () => {
    expect(childPeriodChoices(year).map((option) => option.label)).toEqual(["1분기", "2분기", "3분기", "4분기"]);
    expect(childPeriodChoices(goal("q1", "QUARTER", "2026-01-01", "2026-03-31")).map((option) => option.label)).toEqual([
      "1월",
      "2월",
      "3월",
    ]);
    expect(childPeriodChoices(september).map((option) => `${option.label} ${option.startDate}~${option.endDate}`)).toEqual([
      "9월 1주 2026-09-01~2026-09-06",
      "9월 2주 2026-09-07~2026-09-13",
      "9월 3주 2026-09-14~2026-09-20",
      "9월 4주 2026-09-21~2026-09-27",
      "9월 5주 2026-09-28~2026-09-30",
    ]);
    expect(childPeriodChoices(goal("w", "WEEK", "2026-09-14", "2026-09-20"))).toEqual([]);
    expect(periodChoicesInYear("QUARTER", 2026).map((option) => option.label)).toEqual([
      "2026 1분기",
      "2026 2분기",
      "2026 3분기",
      "2026 4분기",
    ]);
  });
});

describe("GOAL-001 parent selection", () => {
  const goals = [year, q3, september];

  it("uses the Goal the user is in as the parent", () => {
    expect(resolveParent("QUARTER", { startDate: "2026-01-01", endDate: "2026-03-31" }, goals, year)).toEqual({
      kind: "context",
      parent: year,
    });
  });

  it("selects the only valid parent automatically", () => {
    expect(resolveParent("WEEK", { startDate: "2026-09-14", endDate: "2026-09-20" }, goals, null)).toEqual({
      kind: "auto",
      parent: september,
    });
  });

  it("offers only valid parents when there are several", () => {
    const resolution = resolveParent("MONTH", { startDate: "2026-09-01", endDate: "2026-09-30" }, [...goals, q3b], null);
    expect(resolution.kind).toBe("choose");
    expect(resolution.kind === "choose" && resolution.candidates.map((candidate) => candidate.id)).toEqual(["q3", "q3b"]);
  });

  it("asks to create the parent first when none contains the period, and never offers another type", () => {
    expect(resolveParent("MONTH", { startDate: "2026-03-01", endDate: "2026-03-31" }, goals, null)).toEqual({ kind: "none" });
    expect(resolveParent("QUARTER", { startDate: "2027-01-01", endDate: "2027-03-31" }, goals, null)).toEqual({ kind: "none" });
    expect(resolveParent("YEAR", { startDate: "2026-01-01", endDate: "2026-12-31" }, goals, null)).toEqual({ kind: "root" });
  });
});
