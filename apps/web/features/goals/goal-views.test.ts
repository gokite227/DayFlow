import type { GoalResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import {
  datesOfGoal,
  goalContext,
  goalFlows,
  goalsViewHref,
  parseGoalsViewState,
  weekGoalsInWeek,
} from "./goal-views";

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

const goals = [
  goal("w5", "WEEK", "2026-09-28", "2026-09-30", "m9"),
  goal("y", "YEAR", "2026-01-01", "2026-12-31"),
  goal("m9", "MONTH", "2026-09-01", "2026-09-30", "q3"),
  goal("q3", "QUARTER", "2026-07-01", "2026-09-30", "y"),
  goal("q1", "QUARTER", "2026-01-01", "2026-03-31", "y"),
  goal("m10", "MONTH", "2026-10-01", "2026-10-31", "q4"),
  goal("q4", "QUARTER", "2026-10-01", "2026-12-31", "y"),
  goal("w10-1", "WEEK", "2026-10-01", "2026-10-04", "m10"),
  goal("y27", "YEAR", "2027-01-01", "2027-12-31"),
];
const params = (query: string) => new URLSearchParams(query);

describe("GOAL-005 view state in the URL", () => {
  it("reads the view, layout and week and falls back to the overview", () => {
    expect(parseGoalsViewState(params(""), "2026-09-16")).toEqual({
      view: "all",
      layout: "week",
      weekStart: "2026-09-14",
      rootId: null,
    });
    expect(parseGoalsViewState(params("view=week&layout=list&week=2026-09-30"), "2026-09-16")).toMatchObject({
      view: "week",
      layout: "list",
      weekStart: "2026-09-28",
    });
    expect(parseGoalsViewState(params("view=tree&layout=grid"), "2026-09-16")).toMatchObject({ view: "all", layout: "week" });
  });

  it("builds hrefs with only the parameters of the view", () => {
    expect(goalsViewHref({ view: "quarter" }, "2026-09-16")).toBe("/goals?view=quarter");
    expect(goalsViewHref({ view: "week", layout: "list", weekStart: "2026-09-14" }, "2026-09-16")).toBe(
      "/goals?view=week&layout=list",
    );
    expect(goalsViewHref({ view: "week", layout: "week", weekStart: "2026-09-21" }, "2026-09-16")).toBe(
      "/goals?view=week&layout=week&week=2026-09-21",
    );
    expect(goalsViewHref({ view: "all", rootId: "y" }, "2026-09-16")).toBe("/goals?view=all&root=y");
  });
});

describe("GOAL-005 overview helpers", () => {
  it("lays out each YEAR as four stages in period order", () => {
    const [flow2026, flow2027] = goalFlows(goals);
    expect(flow2026?.quarters.map((item) => item.id)).toEqual(["q1", "q3", "q4"]);
    expect(flow2026?.months.map((item) => item.id)).toEqual(["m9", "m10"]);
    expect(flow2026?.weeks.map((item) => item.id)).toEqual(["w5", "w10-1"]);
    expect(flow2027?.quarters).toEqual([]);
    expect(goalFlows(goals, "y27").map((flow) => flow.year.id)).toEqual(["y27"]);
  });

  it("describes where a Goal sits with its ancestors", () => {
    expect(goalContext(goals, goals[0]!)).toBe("2026 y title › 3분기 q3 title › 9월 m9 title");
    expect(goalContext(goals, goals[1]!)).toBe("");
  });

  it("finds the month-cut WEEK Goals touching a Monday-start week", () => {
    expect(weekGoalsInWeek(goals, "2026-09-28").map((item) => item.id)).toEqual(["w5", "w10-1"]);
    expect(weekGoalsInWeek(goals, "2026-09-14")).toEqual([]);
    expect(datesOfGoal(goals[0]!)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });
});
