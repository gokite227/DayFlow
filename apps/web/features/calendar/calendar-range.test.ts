import { describe, expect, it } from "vitest";
import {
  calendarHref,
  calendarRangeLabel,
  monthEnd,
  monthGridDates,
  monthStart,
  parseCalendarViewState,
  shiftCalendarDate,
  shiftMonth,
  viewDates,
} from "./calendar-range";

const params = (query: string) => new URLSearchParams(query);
const TODAY = "2026-09-16"; // Wednesday

describe("CAL-002 calendar view ranges", () => {
  it("week shows the Monday-start week containing the date", () => {
    expect(viewDates({ view: "week", date: TODAY })).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("3day starts at the selected date and day shows one date", () => {
    expect(viewDates({ view: "3day", date: TODAY })).toEqual(["2026-09-16", "2026-09-17", "2026-09-18"]);
    expect(viewDates({ view: "day", date: TODAY })).toEqual(["2026-09-16"]);
  });

  it("moves by 7 / 3 / 1 days", () => {
    expect(shiftCalendarDate({ view: "week", date: TODAY }, 1)).toBe("2026-09-23");
    expect(shiftCalendarDate({ view: "week", date: TODAY }, -1)).toBe("2026-09-09");
    expect(shiftCalendarDate({ view: "3day", date: TODAY }, 1)).toBe("2026-09-19");
    expect(shiftCalendarDate({ view: "day", date: TODAY }, -1)).toBe("2026-09-15");
    // Today keeps the view and returns to today's range.
    expect(viewDates({ view: "week", date: TODAY })).toContain(TODAY);
  });

  it("keeps the reference date when the view changes", () => {
    const date = shiftCalendarDate({ view: "week", date: TODAY }, 1);
    // Week → Day after one week forward: the same weekday of the next week, not a jump.
    expect(viewDates({ view: "day", date })).toEqual(["2026-09-23"]);
    expect(viewDates({ view: "3day", date })[0]).toBe("2026-09-23");
    expect(viewDates({ view: "week", date })).toContain("2026-09-23");
  });
});

describe("CAL-002 calendar view state in the URL", () => {
  it("reads view and date, and defaults to this week with Days and Events", () => {
    expect(parseCalendarViewState(params(""), TODAY)).toEqual({ view: "week", date: TODAY, content: "all", category: null });
    expect(parseCalendarViewState(params("view=3day&date=2026-10-05"), TODAY)).toMatchObject({
      view: "3day",
      date: "2026-10-05",
      content: "all",
    });
    // A Goal deep link has no view or content: the week with everything (GOAL-007).
    expect(parseCalendarViewState(params("date=2026-09-14"), TODAY)).toEqual({ view: "week", date: "2026-09-14", content: "all", category: null });
    expect(parseCalendarViewState(params("view=month&date=nope"), TODAY)).toMatchObject({ view: "month", date: TODAY });
    expect(parseCalendarViewState(params("view=year"), TODAY)).toMatchObject({ view: "week" });
    expect(parseCalendarViewState(params("view=list"), TODAY)).toMatchObject({ view: "list" });
  });

  it("reads content and Category independently of the view", () => {
    expect(parseCalendarViewState(params("view=month&content=events"), TODAY)).toMatchObject({ view: "month", content: "events" });
    expect(parseCalendarViewState(params("view=week&content=events&category=UNCATEGORIZED"), TODAY)).toMatchObject({
      view: "week",
      content: "events",
      category: "UNCATEGORIZED",
    });
    expect(parseCalendarViewState(params("content=everything&category=%3Cscript%3E"), TODAY)).toMatchObject({ content: "all", category: null });
  });

  it("builds hrefs and leaves out today's date and default content", () => {
    expect(calendarHref({ view: "day", date: TODAY }, TODAY)).toBe("/calendar?view=day");
    expect(calendarHref({ view: "week", date: "2026-10-05" }, TODAY)).toBe("/calendar?view=week&date=2026-10-05");
    expect(calendarHref({ view: "month", date: TODAY, content: "events" }, TODAY)).toBe("/calendar?view=month&content=events");
    // Toggling back to 전체 drops the parameter; the Category stays.
    expect(calendarHref({ view: "month", date: "2026-10-05", content: "all", category: "c1" }, TODAY)).toBe(
      "/calendar?view=month&date=2026-10-05&category=c1",
    );
    const roundTrip = calendarHref({ view: "week", date: "2026-10-05", content: "events", category: "c1" }, TODAY);
    expect(parseCalendarViewState(params(roundTrip.split("?")[1]!), TODAY)).toEqual({
      view: "week",
      date: "2026-10-05",
      content: "events",
      category: "c1",
    });
  });
});

describe("Month view", () => {
  it("shows whole Monday-start weeks around the month", () => {
    const grid = viewDates({ view: "month", date: TODAY });
    expect(grid[0]).toBe("2026-08-31"); // Monday before 9/1 (Tuesday)
    expect(grid[grid.length - 1]).toBe("2026-10-04"); // Sunday after 9/30 (Wednesday)
    expect(grid).toHaveLength(35);
    expect(grid).toContain("2026-09-01");
    expect(grid).toContain("2026-09-30");
    // A month starting on Monday and needing six rows.
    expect(monthGridDates("2027-02-10")).toHaveLength(28); // February 2027 starts on a Monday
    expect(monthGridDates("2026-02-10")[0]).toBe("2026-01-26"); // February 2026 starts on a Sunday
    expect(monthGridDates("2026-08-01")).toHaveLength(42);
  });

  it("moves by a month, keeping the day inside shorter months, and today returns to this month", () => {
    expect(shiftCalendarDate({ view: "month", date: TODAY }, 1)).toBe("2026-10-16");
    expect(shiftCalendarDate({ view: "month", date: TODAY }, -1)).toBe("2026-08-16");
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-15");
    expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-15");
    expect(monthStart(TODAY)).toBe("2026-09-01");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(calendarRangeLabel({ view: "month", date: TODAY })).toBe("2026년 9월");
  });

  it("list uses the week of the date", () => {
    expect(viewDates({ view: "list", date: TODAY })).toEqual(viewDates({ view: "week", date: TODAY }));
    expect(shiftCalendarDate({ view: "list", date: TODAY }, 1)).toBe("2026-09-23");
  });
});

describe("CAL-006 Korean range labels", () => {
  it("writes dates in Korean without English months", () => {
    expect(calendarRangeLabel({ view: "week", date: TODAY })).toBe("2026년 9월 14일 ~ 9월 20일");
    expect(calendarRangeLabel({ view: "3day", date: "2026-09-30" })).toBe("2026년 9월 30일 ~ 10월 2일");
    expect(calendarRangeLabel({ view: "day", date: TODAY })).toBe("2026년 9월 16일");
    expect(calendarRangeLabel({ view: "week", date: "2026-12-31" })).toBe("2026년 12월 28일 ~ 2027년 1월 3일");
  });
});
