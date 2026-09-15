import type { GoalResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { childTypeOf, childrenOf, goalPath, parentTypeOf } from "./goal-tree";

function goal(id: string, type: GoalResponse["type"], parentGoalId: string | null, startDate = "2026-01-01"): GoalResponse {
  return {
    id,
    parentGoalId,
    type,
    title: id,
    why: "",
    startDate,
    endDate: "2026-12-31",
    priority: 1,
    progressPolicy: "AUTO",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 0,
  };
}

const goals = [
  goal("week", "WEEK", "month", "2026-09-14"),
  goal("year", "YEAR", null),
  goal("month", "MONTH", "quarter", "2026-09-01"),
  goal("quarter", "QUARTER", "year", "2026-07-01"),
  goal("q1", "QUARTER", "year", "2026-01-01"),
  goal("other-year", "YEAR", null, "2026-02-01"),
];

describe("GOAL-001 hierarchy helpers", () => {
  it("allows only the next level as parent and child", () => {
    expect(parentTypeOf("YEAR")).toBeNull();
    expect(parentTypeOf("WEEK")).toBe("MONTH");
    expect(childTypeOf("QUARTER")).toBe("MONTH");
    expect(childTypeOf("WEEK")).toBeNull();
  });

  it("lists only the direct children of one Goal, ordered by start date", () => {
    expect(childrenOf(goals, "year").map((child) => child.id)).toEqual(["q1", "quarter"]);
    expect(childrenOf(goals, "week")).toEqual([]);
  });

  it("returns the path from the root", () => {
    expect(goalPath(goals, goals[0]!).map((ancestor) => ancestor.id)).toEqual(["year", "quarter", "month", "week"]);
  });
});
