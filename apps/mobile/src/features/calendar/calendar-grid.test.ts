import type { DayResponse, EventOccurrenceResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { startOfWeek } from "../../lib/dates";
import { dayFixture } from "../../test-fixtures";
import {
  HOUR_HEIGHT,
  MIN_BLOCK_HEIGHT,
  applyDropToDay,
  blockHeight,
  columnPlacement,
  dateOnlyItems,
  defaultScheduleLength,
  describeDropAction,
  initialScrollY,
  nowLineTop,
  planDrop,
  rangeLabel,
  resizedLength,
  resolveDrop,
  scheduleRequest,
  selectedDateFromParam,
  shiftViewDate,
  snapMinutes,
  unscheduledDays,
  viewDates,
  type DropGeometry,
} from "./calendar-grid";

const schedule = (startAt: string, endAt: string) => ({ id: "s1", dayId: "d", startAt, endAt, timezone: "Asia/Seoul", createdAt: "", updatedAt: "", version: 3 });
const timedDay = (overrides: Partial<DayResponse> = {}) =>
  dayFixture({ id: "timed", plannedDate: "2026-09-16", schedule: schedule("2026-09-16T14:00:00+09:00", "2026-09-16T15:00:00+09:00"), version: 5, ...overrides });

const occurrence = (overrides: Partial<EventOccurrenceResponse>): EventOccurrenceResponse => ({
  eventId: "e",
  eventVersion: 0,
  title: "면접",
  category: null,
  allDay: false,
  startAt: "2026-09-16T14:30:00+09:00",
  endAt: "2026-09-16T15:30:00+09:00",
  startDate: null,
  endDateExclusive: null,
  timezone: "Asia/Seoul",
  location: null,
  recurrence: "NONE",
  linkedGoalId: null,
  ...overrides,
});

describe("Calendar ranges", () => {
  it("shows one day, three days from the date, or the week", () => {
    expect(viewDates("day", "2026-09-16", "monday")).toEqual(["2026-09-16"]);
    expect(viewDates("3day", "2026-09-30", "monday")).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(viewDates("week", "2026-09-16", "monday")).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("follows the Calendar week start setting (Sunday) without changing the Monday default", () => {
    expect(viewDates("week", "2026-09-16", "sunday")[0]).toBe("2026-09-13");
    expect(viewDates("week", "2026-09-13", "sunday")[0]).toBe("2026-09-13");
    expect(viewDates("week", "2026-09-13", "monday")[0]).toBe("2026-09-07");
    // Goals and Review keep calling startOfWeek without a setting: always Monday.
    expect(startOfWeek("2026-09-13")).toBe("2026-09-07");
  });

  it("moves by 1 / 3 / 7 days and labels ranges", () => {
    expect(shiftViewDate("day", "2026-09-16", -1)).toBe("2026-09-15");
    expect(shiftViewDate("3day", "2026-09-16", 1)).toBe("2026-09-19");
    expect(shiftViewDate("week", "2026-09-16", 1)).toBe("2026-09-23");
    expect(rangeLabel(["2026-09-16"])).toBe("2026년 9월 16일");
    expect(rangeLabel(viewDates("week", "2026-09-16", "monday"))).toBe("2026년 9월 14일 ~ 9월 20일");
    expect(rangeLabel(["2026-12-31", "2027-01-01"])).toBe("2026년 12월 31일 ~ 2027년 1월 1일");
    expect(selectedDateFromParam("2026-02-30", "2026-09-16")).toBe("2026-09-16");
  });
});

describe("Calendar time math", () => {
  it("snaps to 15 minutes", () => {
    expect([7, 8, 22, 23, 1439].map(snapMinutes)).toEqual([0, 15, 15, 30, 1440]);
    expect(defaultScheduleLength(50)).toBe(45);
    expect(defaultScheduleLength(5)).toBe(15);
  });

  it("places the current-time line and the initial scroll", () => {
    expect(nowLineTop(14 * 60 + 30)).toBe(14.5 * HOUR_HEIGHT);
    expect(initialScrollY(9 * 60)).toBe(7 * HOUR_HEIGHT);
    expect(initialScrollY(60)).toBe(0);
  });

  it("keeps the drawing floor separate from the stored duration", () => {
    expect(blockHeight(15)).toBe(MIN_BLOCK_HEIGHT);
    expect(blockHeight(60)).toBe(HOUR_HEIGHT - 1);
    expect(resizedLength(60, 4, 14 * 60)).toBe(60);
    expect(resizedLength(60, 0.75 * HOUR_HEIGHT, 14 * 60)).toBe(105);
    expect(resizedLength(60, -10 * HOUR_HEIGHT, 14 * 60)).toBe(15);
    expect(resizedLength(60, 20 * HOUR_HEIGHT, 23 * 60)).toBe(60);
  });

  it("builds the schedule request in the schedule timezone", () => {
    expect(scheduleRequest("2026-09-17", 14 * 60, 60, null, "Asia/Seoul")).toEqual({
      startAt: "2026-09-17T14:00:00+09:00",
      endAt: "2026-09-17T15:00:00+09:00",
      timezone: "Asia/Seoul",
      expectedVersion: null,
    });
    const day = timedDay();
    expect(scheduleRequest("2026-09-16", 23 * 60, 60, day.schedule, "Asia/Seoul")).toMatchObject({ endAt: "2026-09-17T00:00:00+09:00", expectedVersion: 3 });
  });
});

describe("Calendar drops", () => {
  it("drag position → start time: unscheduled Day to 9/17 14:00 with its estimate", () => {
    const unscheduled = dayFixture({ id: "u", plannedDate: null, estimatedMinutes: 60 });
    const action = planDrop(unscheduled, { kind: "time", date: "2026-09-17" }, 14 * HOUR_HEIGHT + 5);
    expect(action).toEqual({ type: "setSchedule", date: "2026-09-17", startMinutes: 14 * 60, lengthMinutes: 60 });
    expect(describeDropAction(action, unscheduled)).toBe("9/17 14:00–15:00");
    expect(applyDropToDay(unscheduled, action!, "Asia/Seoul")).toMatchObject({
      plannedDate: "2026-09-17",
      schedule: { startAt: "2026-09-17T14:00:00+09:00", endAt: "2026-09-17T15:00:00+09:00" },
    });
  });

  it("unscheduled Day → date-only area sets only the date", () => {
    const unscheduled = dayFixture({ id: "u", plannedDate: null });
    const action = planDrop(unscheduled, { kind: "date", date: "2026-09-18" }, 0);
    expect(action).toEqual({ type: "moveDate", date: "2026-09-18" });
    expect(applyDropToDay(unscheduled, action!, "Asia/Seoul")).toMatchObject({ plannedDate: "2026-09-18", schedule: null });
  });

  it("timed Day → another time, another date, date-only, or 날짜 없음", () => {
    const day = timedDay();
    expect(planDrop(day, { kind: "time", date: "2026-09-16" }, 14 * HOUR_HEIGHT)).toBeNull();
    expect(planDrop(day, { kind: "time", date: "2026-09-16" }, 16.25 * HOUR_HEIGHT)).toMatchObject({ startMinutes: 16 * 60 + 15, lengthMinutes: 60 });
    expect(planDrop(day, { kind: "time", date: "2026-09-18" }, 9 * HOUR_HEIGHT)).toEqual({ type: "setSchedule", date: "2026-09-18", startMinutes: 540, lengthMinutes: 60 });
    expect(planDrop(day, { kind: "time", date: "2026-09-16" }, 23.9 * HOUR_HEIGHT)).toMatchObject({ startMinutes: 23 * 60 });
    expect(planDrop(day, { kind: "date", date: "2026-09-16" }, 0)).toEqual({ type: "unschedule", moveToDate: null });
    expect(planDrop(day, { kind: "date", date: "2026-09-19" }, 0)).toEqual({ type: "unschedule", moveToDate: "2026-09-19" });
    const toUnscheduled = planDrop(day, { kind: "unscheduled" }, 0);
    expect(toUnscheduled).toEqual({ type: "moveDate", date: null });
    expect(applyDropToDay(day, toUnscheduled!, "Asia/Seoul")).toMatchObject({ plannedDate: null, schedule: null });
    expect(planDrop(dayFixture({ plannedDate: null }), { kind: "unscheduled" }, 0)).toBeNull();
  });

  it("resolves finger positions to targets, with 날짜 없음 winning", () => {
    const geometry: DropGeometry = {
      dates: ["2026-09-14", "2026-09-15", "2026-09-16"],
      grid: { x: 0, y: 200, width: 390, height: 500 },
      dateOnly: { x: 0, y: 150, width: 390, height: 50 },
      unscheduled: [{ x: 280, y: 100, width: 110, height: 40 }],
      gutterWidth: 44,
      columnWidth: 100,
      scrollX: 50,
      scrollY: 480,
      hourHeight: HOUR_HEIGHT,
    };
    expect(resolveDrop({ x: 100, y: 400 }, 380, geometry)).toEqual({ target: { kind: "time", date: "2026-09-15" }, offsetPx: 660 });
    expect(resolveDrop({ x: 30, y: 400 }, 380, { ...geometry, scrollX: 0 })).toBeNull();
    expect(resolveDrop({ x: 240, y: 170 }, 160, geometry)).toEqual({ target: { kind: "date", date: "2026-09-16" }, offsetPx: 0 });
    expect(resolveDrop({ x: 300, y: 120 }, 110, geometry)).toEqual({ target: { kind: "unscheduled" }, offsetPx: 0 });
    expect(resolveDrop({ x: 300, y: 20 }, 10, geometry)).toBeNull();
    expect(resolveDrop({ x: 300, y: 170 }, 160, geometry)).toBeNull();
  });
});

describe("Calendar columns", () => {
  it("lays out overlapping Days and Events side by side", () => {
    const days = [timedDay(), timedDay({ id: "other", schedule: schedule("2026-09-16T18:00:00+09:00", "2026-09-16T19:00:00+09:00") })];
    const column = columnPlacement("2026-09-16", days, [occurrence({})]);
    expect(column.days.map((placement) => [placement.day.id, placement.start, placement.length])).toEqual([
      ["timed", 840, 60],
      ["other", 1080, 60],
    ]);
    expect(column.slots.get("day:timed")).toEqual({ lane: 0, lanes: 2 });
    expect(column.slots.get("event:e:0")).toEqual({ lane: 1, lanes: 2 });
    expect(column.slots.get("day:other")).toEqual({ lane: 0, lanes: 1 });
  });

  it("puts all-day Events and date-only Days in the top area", () => {
    const days = [dayFixture({ id: "dateonly", plannedDate: "2026-09-16" }), timedDay(), dayFixture({ id: "none", plannedDate: null })];
    const allDay = occurrence({ allDay: true, startAt: null, endAt: null, startDate: "2026-09-15", endDateExclusive: "2026-09-17" });
    const items = dateOnlyItems("2026-09-16", days, [allDay, occurrence({})]);
    expect(items.dateOnlyDays.map((day) => day.id)).toEqual(["dateonly"]);
    expect(items.allDayEvents).toEqual([allDay]);
    expect(unscheduledDays(days).map((day) => day.id)).toEqual(["none"]);
  });
});
