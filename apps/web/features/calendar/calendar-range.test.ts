import { describe, expect, it } from "vitest";
import {
  calendarHref,
  calendarRangeLabel,
  parseCalendarViewState,
  shiftCalendarDate,
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
  it("reads view and date, and defaults to this week", () => {
    expect(parseCalendarViewState(params(""), TODAY)).toEqual({ view: "week", date: TODAY });
    expect(parseCalendarViewState(params("view=3day&date=2026-10-05"), TODAY)).toEqual({
      view: "3day",
      date: "2026-10-05",
    });
    // A Goal deep link has no view: week is the default (GOAL-007).
    expect(parseCalendarViewState(params("date=2026-09-14"), TODAY)).toEqual({ view: "week", date: "2026-09-14" });
    expect(parseCalendarViewState(params("view=month&date=nope"), TODAY)).toEqual({ view: "week", date: TODAY });
  });

  it("builds hrefs and leaves out today's date", () => {
    expect(calendarHref({ view: "day", date: TODAY }, TODAY)).toBe("/calendar?view=day");
    expect(calendarHref({ view: "week", date: "2026-10-05" }, TODAY)).toBe("/calendar?view=week&date=2026-10-05");
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
