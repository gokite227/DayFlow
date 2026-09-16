import { describe, expect, it } from "vitest";
import { dayFixture, goalFixture } from "../../test-fixtures";
import {
  countByView,
  dayFormProblem,
  dayGoalLine,
  describeDaySchedule,
  doneToggleRequest,
  emptyDaysFilters,
  filterDays,
  quickAddDayRequest,
  toUpdateDayRequest,
  dayToValues,
  weekGoalChoices,
} from "./day-values";

const today = "2026-09-16";
const tag = { id: "t1", name: "공부", color: "#8aa6ee", sortOrder: 0, createdAt: "", updatedAt: "", version: 0 };
const days = [
  dayFixture({ id: "a", plannedDate: "2026-09-17", goalId: "w", priority: "HIGH", tags: [tag] }),
  dayFixture({ id: "b", plannedDate: null }),
  dayFixture({ id: "c", plannedDate: "2026-09-16", status: "DONE" }),
  dayFixture({ id: "d", plannedDate: "2026-09-10" }),
];

describe("Days Task Inbox", () => {
  it("filters by view, Goal, Tag and priority", () => {
    expect(countByView(days, today)).toEqual({ all: 4, upcoming: 1, unplanned: 1, done: 1 });
    expect(filterDays(days, { ...emptyDaysFilters(), goal: "without" }, today).map((day) => day.id)).toEqual(["b", "c", "d"]);
    expect(filterDays(days, { ...emptyDaysFilters(), goal: "with" }, today).map((day) => day.id)).toEqual(["a"]);
    expect(filterDays(days, { ...emptyDaysFilters(), tagIds: ["t1"] }, today).map((day) => day.id)).toEqual(["a"]);
    expect(filterDays(days, { ...emptyDaysFilters(), priority: "HIGH" }, today).map((day) => day.id)).toEqual(["a"]);
    expect(filterDays(days, { ...emptyDaysFilters(), view: "unplanned" }, today).map((day) => day.id)).toEqual(["b"]);
  });

  it("renders no Goal line for a Day without a Goal", () => {
    const week = goalFixture({ id: "w", type: "WEEK", title: "백엔드", startDate: "2026-09-14", endDate: "2026-09-20" });
    const goalsById = new Map([[week.id, week]]);
    expect(dayGoalLine(days[1]!, goalsById)).toBeNull();
    expect(dayGoalLine(days[0]!, goalsById)).toBe("9월 3주 · 백엔드");
  });

  it("builds requests: quick add without Goal/date, done toggle with only status + version", () => {
    expect(quickAddDayRequest(" 장보기 ")).toMatchObject({ title: "장보기", goalId: null, plannedDate: null, tagIds: [] });
    expect(doneToggleRequest({ status: "DONE", version: 4 })).toEqual({ status: "NOT_STARTED", version: 4 });
    const values = { ...dayToValues(days[0]!), goalId: "", tagIds: [] };
    expect(toUpdateDayRequest(values, days[0]!)).toMatchObject({ goalId: null, tagIds: [], version: 0 });
    expect(dayFormProblem({ ...values, title: " " })).toBe("title");
    expect(dayFormProblem({ ...values, estimatedMinutes: "0" })).toBe("minutes");
  });

  it("describes schedules with the schedule wall clock", () => {
    expect(describeDaySchedule({ plannedDate: null, schedule: null })).toBe("날짜 미정");
    expect(describeDaySchedule({ plannedDate: "2026-09-16", schedule: null })).toBe("9/16 · 시간 미정");
    expect(
      describeDaySchedule({
        plannedDate: "2026-09-16",
        schedule: { id: "s", dayId: "a", startAt: "2026-09-16T19:00:00+09:00", endAt: "2026-09-16T20:30:00+09:00", timezone: "Asia/Seoul", createdAt: "", updatedAt: "", version: 0 },
      }),
    ).toBe("9/16 · 19:00–20:30");
  });

  it("offers only WEEK Goals containing the chosen date", () => {
    const goals = [
      goalFixture({ id: "w1", type: "WEEK", startDate: "2026-09-14", endDate: "2026-09-20" }),
      goalFixture({ id: "w2", type: "WEEK", startDate: "2026-09-21", endDate: "2026-09-27" }),
      goalFixture({ id: "m", type: "MONTH", startDate: "2026-09-01", endDate: "2026-09-30" }),
    ];
    expect(weekGoalChoices(goals, "2026-09-22").map((goal) => goal.id)).toEqual(["w2"]);
    expect(weekGoalChoices(goals, "").map((goal) => goal.id)).toEqual(["w1", "w2"]);
  });
});