import { describe, expect, it } from "vitest";
import { daysOutsideRange, groupDaysByWeek, periodGoalFormIssue, periodGoalStatus, sortPeriodGoals } from "../src";

const goal = (title: string, startDate: string, endDate: string) => ({ title, startDate, endDate });
const day = (id: string, plannedDate: string | null) => ({ id, plannedDate });

describe("PERIOD Goal status", () => {
  it("derives UPCOMING / ACTIVE / ENDED from the dates, inclusive at both ends", () => {
    const range = goal("중간고사", "2026-09-21", "2026-10-08");
    expect(periodGoalStatus(range, "2026-09-20")).toBe("UPCOMING");
    expect(periodGoalStatus(range, "2026-09-21")).toBe("ACTIVE");
    expect(periodGoalStatus(range, "2026-10-08")).toBe("ACTIVE");
    expect(periodGoalStatus(range, "2026-10-09")).toBe("ENDED");
  });

  it("orders active (ending soonest), upcoming (starting soonest), ended (latest first)", () => {
    const today = "2026-09-25";
    const sorted = sortPeriodGoals(
      [
        goal("ended-old", "2026-08-01", "2026-08-10"),
        goal("upcoming-late", "2026-11-01", "2026-11-05"),
        goal("active-long", "2026-09-01", "2026-12-31"),
        goal("ended-new", "2026-09-01", "2026-09-10"),
        goal("upcoming-soon", "2026-10-01", "2026-10-05"),
        goal("active-short", "2026-09-20", "2026-09-30"),
      ],
      today,
    );
    expect(sorted.map((entry) => entry.title)).toEqual([
      "active-short",
      "active-long",
      "upcoming-soon",
      "upcoming-late",
      "ended-new",
      "ended-old",
    ]);
  });
});

describe("PERIOD Goal form validation", () => {
  it("requires a title and both dates, with start on or before end", () => {
    expect(periodGoalFormIssue({ title: " ", startDate: "2026-09-21", endDate: "2026-10-08" })).toBe("title");
    expect(periodGoalFormIssue({ title: "여행", startDate: "", endDate: "2026-10-08" })).toBe("startDate");
    expect(periodGoalFormIssue({ title: "여행", startDate: "2026-09-21", endDate: "2026-02-30" })).toBe("endDate");
    expect(periodGoalFormIssue({ title: "여행", startDate: "2026-10-09", endDate: "2026-10-08" })).toBe("range");
    expect(periodGoalFormIssue({ title: "여행", startDate: "2026-10-08", endDate: "2026-10-08" })).toBeNull();
  });

  it("finds linked Days a shorter range would leave outside; undated Days never block", () => {
    const days = [day("a", "2026-09-21"), day("b", "2026-10-08"), day("c", null)];
    expect(daysOutsideRange(days, goal("", "2026-09-21", "2026-10-07")).map((entry) => entry.id)).toEqual(["b"]);
    expect(daysOutsideRange(days, goal("", "2026-09-21", "2026-10-08"))).toEqual([]);
  });
});

describe("PERIOD Goal week grouping (UI only)", () => {
  it("groups by Monday-start week cut to the Goal range, undated last", () => {
    // 2026-09-21 is a Monday; the range starts on a Wednesday and ends on a Thursday.
    const range = goal("", "2026-09-23", "2026-10-08");
    const groups = groupDaysByWeek(
      [day("d3", "2026-10-08"), day("u", null), day("d1", "2026-09-27"), day("d2", "2026-09-28"), day("d0", "2026-09-23")],
      range,
    );
    expect(groups.map((group) => [group.key, group.range, group.days.map((entry) => entry.id)])).toEqual([
      ["2026-09-21", { startDate: "2026-09-23", endDate: "2026-09-27" }, ["d0", "d1"]],
      ["2026-09-28", { startDate: "2026-09-28", endDate: "2026-10-04" }, ["d2"]],
      ["2026-10-05", { startDate: "2026-10-05", endDate: "2026-10-08" }, ["d3"]],
      ["undated", null, ["u"]],
    ]);
  });

  it("returns no groups for a Goal without Days", () => {
    expect(groupDaysByWeek([], goal("", "2026-09-21", "2026-10-08"))).toEqual([]);
  });
});
