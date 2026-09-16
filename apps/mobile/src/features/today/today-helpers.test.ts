import { describe, expect, it } from "vitest";
import { dayFixture, goalFixture } from "../../test-fixtures";
import { currentWeekGoals, dayGoalPath, todayDays, todayProgress } from "./today-helpers";

const year = goalFixture({ id: "y", title: "2026 취업" });
const week = goalFixture({ id: "w", type: "WEEK", parentGoalId: "y", title: "백엔드", startDate: "2026-09-14", endDate: "2026-09-20" });
const nextWeek = goalFixture({ id: "w2", type: "WEEK", title: "다음 주", startDate: "2026-09-21", endDate: "2026-09-27" });

describe("Today data", () => {
  const days = [
    dayFixture({ id: "plain", plannedDate: "2026-09-16" }),
    dayFixture({ id: "core", plannedDate: "2026-09-16", coreDay: true, goalId: "w", status: "DONE" }),
    dayFixture({ id: "tomorrow", plannedDate: "2026-09-17" }),
    dayFixture({ id: "dropped", plannedDate: "2026-09-16", status: "SKIPPED" }),
  ];

  it("lists today's Days with core Days first, with or without a Goal", () => {
    expect(todayDays(days, "2026-09-16").map((day) => day.id)).toEqual(["core", "plain", "dropped"]);
  });

  it("shows the Goal path only for Days that have a Goal", () => {
    expect(dayGoalPath(days[1]!, [year, week])).toBe("2026 취업 › 백엔드");
    expect(dayGoalPath(days[0]!, [year, week])).toBeNull();
  });

  it("finds the WEEK Goals containing today and counts progress without let-go Days", () => {
    expect(currentWeekGoals([nextWeek, week, year], "2026-09-16").map((goal) => goal.id)).toEqual(["w"]);
    expect(todayProgress(todayDays(days, "2026-09-16"))).toEqual({ total: 2, done: 1 });
  });
});