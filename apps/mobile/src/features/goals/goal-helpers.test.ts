import { describe, expect, it } from "vitest";
import { dayFixture, goalFixture } from "../../test-fixtures";
import { childrenOf, goalPath, goalPeriodLabel, goalsOfType, summarizeGoal, yearFlowStages } from "./goal-helpers";

const year = goalFixture({ id: "y", title: "2026 취업" });
const quarter = goalFixture({ id: "q", type: "QUARTER", parentGoalId: "y", title: "3분기", startDate: "2026-07-01", endDate: "2026-09-30" });
const month = goalFixture({ id: "m", type: "MONTH", parentGoalId: "q", title: "9월", startDate: "2026-09-01", endDate: "2026-09-30" });
const week = goalFixture({ id: "w", type: "WEEK", parentGoalId: "m", title: "백엔드", startDate: "2026-09-14", endDate: "2026-09-20" });
const goals = [week, month, quarter, year];

describe("Goals on mobile", () => {
  it("labels canonical periods", () => {
    expect(goalPeriodLabel(year)).toBe("2026");
    expect(goalPeriodLabel(quarter)).toBe("3분기");
    expect(goalPeriodLabel(month, true)).toBe("2026년 9월");
    expect(goalPeriodLabel(week)).toBe("9월 3주");
  });

  it("drills down one level and builds the back path", () => {
    expect(goalsOfType(goals, "QUARTER").map((goal) => goal.id)).toEqual(["q"]);
    expect(childrenOf(goals, "q").map((goal) => goal.id)).toEqual(["m"]);
    expect(goalPath(goals, week).map((goal) => goal.id)).toEqual(["y", "q", "m", "w"]);
  });

  it("counts progress only from Days linked to the Goal subtree", () => {
    const days = [
      dayFixture({ id: "1", goalId: "w", status: "DONE" }),
      dayFixture({ id: "2", goalId: "w" }),
      dayFixture({ id: "3", goalId: null, status: "DONE" }),
      dayFixture({ id: "4", goalId: "w", status: "SKIPPED" }),
    ];
    expect(summarizeGoal(goals, days, "y")).toMatchObject({ total: 3, done: 1, skipped: 1, completionRate: 0.5 });
  });

  it("shows a YEAR as vertical QUARTER → MONTH → WEEK stages", () => {
    expect(yearFlowStages(goals, "y").map((stage) => [stage.type, stage.goals.map((goal) => goal.id)])).toEqual([
      ["QUARTER", ["q"]],
      ["MONTH", ["m"]],
      ["WEEK", ["w"]],
    ]);
  });
});