import type { GoalResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { buildGoalTree, childTypeOf, goalPath, parentCandidates, parentTypeOf } from "./goal-tree";

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
  goal("other-year", "YEAR", null, "2026-02-01"),
];

describe("GOAL-001 hierarchy helpers", () => {
  it("allows only the next level as parent and child", () => {
    expect(parentTypeOf("YEAR")).toBeNull();
    expect(parentTypeOf("WEEK")).toBe("MONTH");
    expect(childTypeOf("QUARTER")).toBe("MONTH");
    expect(childTypeOf("WEEK")).toBeNull();
  });

  it("offers only Goals of the direct parent type, excluding the edited Goal", () => {
    expect(parentCandidates(goals, "MONTH").map((candidate) => candidate.id)).toEqual(["quarter"]);
    expect(parentCandidates(goals, "QUARTER").map((candidate) => candidate.id)).toEqual(["year", "other-year"]);
    expect(parentCandidates(goals, "QUARTER", "year").map((candidate) => candidate.id)).toEqual(["other-year"]);
    expect(parentCandidates(goals, "YEAR")).toEqual([]);
  });

  it("builds YEAR → QUARTER → MONTH → WEEK trees ordered by start date", () => {
    const tree = buildGoalTree(goals);

    expect(tree.map((node) => node.goal.id)).toEqual(["year", "other-year"]);
    expect(tree[0]?.children[0]?.children[0]?.children[0]?.goal.id).toBe("week");
  });

  it("keeps Goals with a missing parent visible as roots", () => {
    expect(buildGoalTree([goal("orphan", "QUARTER", "deleted-year")]).map((node) => node.goal.id)).toEqual([
      "orphan",
    ]);
  });

  it("returns the path from the root", () => {
    expect(goalPath(goals, goals[0]!).map((ancestor) => ancestor.id)).toEqual(["year", "quarter", "month", "week"]);
  });
});
