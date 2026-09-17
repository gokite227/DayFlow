import type { DayResponse, EventOccurrenceResponse, EventResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { wallClock } from "../../lib/dates";
import { dayFixture } from "../../test-fixtures";
import { planScheduleSave, scheduleFormProblem, scheduleFormValues, timeLabel, type ScheduleFormValues } from "../days/day-schedule-values";
import { eventFormProblem, eventToValues, toUpdateEventRequest } from "../events/event-display";
import {
  BLOCK_METRICS,
  HOUR_HEIGHT,
  TIER_CONTENT_HEIGHT,
  blockGeometry,
  columnGeometry,
  columnPlacement,
  planDrop,
  resizedLength,
  scheduleRequest,
  type BlockTier,
} from "./calendar-grid";

/**
 * Time precision vs. interaction snap: stored times, detail editors and drawing are minute-precise; only a Calendar
 * drag / resize that really moves something snaps to 15 minutes.
 */
const DATE = "2026-09-18";
const at = (clock: string) => `${DATE}T${clock}:00+09:00`;
const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const px = (mins: number) => (mins / 60) * HOUR_HEIGHT;
const schedule = (start: string, end: string, version = 1) => ({ id: "s", dayId: "d", startAt: at(start), endAt: at(end), timezone: "Asia/Seoul", createdAt: "", updatedAt: "", version });
const scheduledDay = (id: string, start: string, end: string, overrides: Partial<DayResponse> = {}) =>
  dayFixture({ id, plannedDate: DATE, schedule: schedule(start, end), ...overrides });
const timedOccurrence = (eventId: string, start: string, end: string): EventOccurrenceResponse => ({
  eventId,
  eventVersion: 0,
  title: "면접",
  category: null,
  allDay: false,
  startAt: at(start),
  endAt: at(end),
  startDate: null,
  endDateExclusive: null,
  timezone: "Asia/Seoul",
  location: null,
  recurrence: "NONE",
  linkedGoalId: null,
});
/** A block with nothing below it until midnight and nothing above it. */
const alone = (start: string, length: number) => blockGeometry(minutes(start), length, 24 * 60 - minutes(start), px(minutes(start)));

describe("Calendar geometry is minute-precise", () => {
  it("places 20:27 and 21:03 at their exact minute, between the 15-minute lines", () => {
    expect(alone("20:27", 60).top).toBeCloseTo(px(20 * 60 + 27));
    expect(alone("20:27", 60).top).toBeGreaterThan(px(20 * 60 + 15));
    expect(alone("20:27", 60).top).toBeLessThan(px(20 * 60 + 30));
    expect(alone("21:03", 60).top).toBeCloseTo(px(21 * 60 + 3));
    expect(alone("21:03", 60).top - px(21 * 60)).toBeCloseTo(2.4);
  });

  it.each<[number, number, boolean, BlockTier]>([
    // duration, drawn height, floored, tier
    [5, BLOCK_METRICS.minVisualHeight - 1, true, "tiny"],
    [10, BLOCK_METRICS.minVisualHeight - 1, true, "tiny"],
    [14, BLOCK_METRICS.minVisualHeight - 1, true, "tiny"],
    [15, BLOCK_METRICS.minVisualHeight - 1, true, "tiny"],
    [30, 23, false, "title"],
    [45, 35, false, "start"],
    [60, 47, false, "range"],
  ])("a %i-minute block: the real time height is exact, the drawing has a readable floor", (length, height, floored, tier) => {
    const geometry = alone("20:27", length);
    expect(geometry.timeHeight).toBeCloseTo(px(length));
    expect(geometry.height).toBeCloseTo(height);
    expect(geometry.floored).toBe(floored);
    expect(geometry.tier).toBe(tier);
  });

  it("keeps the text of every tier inside the drawn block and the handle off the text", () => {
    for (const length of [5, 10, 14, 15, 20, 25, 30, 40, 45, 55, 60, 90, 180]) {
      const geometry = alone("08:00", length);
      expect(TIER_CONTENT_HEIGHT[geometry.tier]).toBeLessThanOrEqual(geometry.height);
      if (geometry.handle === "inside") expect(TIER_CONTENT_HEIGHT[geometry.tier] + BLOCK_METRICS.handleHeight).toBeLessThanOrEqual(geometry.height);
    }
    // Only long blocks show the time range; short ones hide it, very short ones show a compact title.
    expect(alone("20:27", 60).tier).toBe("range");
    expect(alone("20:27", 45).tier).toBe("start");
    expect(alone("20:27", 30).tier).toBe("title");
    expect(alone("20:27", 5).tier).toBe("tiny");
    expect(alone("20:27", 5).handle).toBe("below");
    expect(alone("20:27", 60).handle).toBe("inside");
  });

  it("gives short blocks a comfortable press area without drawing them taller", () => {
    const geometry = alone("20:27", 5);
    expect(geometry.height + geometry.hitSlop.top + geometry.hitSlop.bottom + BLOCK_METRICS.handleHeight).toBeGreaterThanOrEqual(BLOCK_METRICS.minHitHeight);
    expect(geometry.height).toBeLessThan(BLOCK_METRICS.minHitHeight);
    // A long block needs no extra area.
    expect(alone("20:27", 60).hitSlop).toEqual({ top: 0, bottom: 0 });
  });

  it("never draws, handles or press areas into the next block", () => {
    const column = columnPlacement(DATE, [scheduledDay("short", "20:27", "20:32"), scheduledDay("next", "20:35", "21:00")], []);
    // Real times do not overlap: one lane each, full width.
    expect(column.slots.get("day:short")).toEqual({ lane: 0, lanes: 1 });
    expect(column.slots.get("day:next")).toEqual({ lane: 0, lanes: 1 });
    const geometry = columnGeometry(column);
    const short = geometry.get("day:short")!;
    const next = geometry.get("day:next")!;
    expect(short.top + short.height).toBeLessThanOrEqual(next.top);
    expect(short.top + short.height + short.hitSlop.bottom).toBeLessThanOrEqual(next.top);
    expect(short.handle).toBe("none");
    expect(next.top - next.hitSlop.top).toBeGreaterThanOrEqual(short.top + short.height);
  });
});

describe("Overlaps follow the real times", () => {
  it("20:27–20:32 and 20:30–21:30 overlap: two lanes", () => {
    const column = columnPlacement(DATE, [scheduledDay("short", "20:27", "20:32")], [timedOccurrence("e", "20:30", "21:30")]);
    expect(column.slots.get("day:short")).toEqual({ lane: 0, lanes: 2 });
    expect(column.slots.get("event:e:0")).toEqual({ lane: 1, lanes: 2 });
  });

  it("a short block drawn taller does not push a later, non-overlapping one into another lane", () => {
    const column = columnPlacement(DATE, [scheduledDay("short", "20:27", "20:32")], [timedOccurrence("e", "20:32", "21:30")]);
    expect(column.slots.get("day:short")).toEqual({ lane: 0, lanes: 1 });
    expect(column.slots.get("event:e:0")).toEqual({ lane: 0, lanes: 1 });
  });
});

describe("Calendar drag and resize snap to 15 minutes; opening does not", () => {
  const day = scheduledDay("d", "20:27", "21:27", { version: 5 });

  it("dragging a 20:27 Day snaps its start and keeps its length", () => {
    expect(planDrop(day, { kind: "time", date: DATE }, px(21 * 60 + 5))).toEqual({ type: "setSchedule", date: DATE, startMinutes: 21 * 60, lengthMinutes: 60 });
    expect(planDrop(day, { kind: "time", date: DATE }, px(20 * 60 + 36))).toEqual({ type: "setSchedule", date: DATE, startMinutes: 20 * 60 + 30, lengthMinutes: 60 });
    expect(planDrop(day, { kind: "time", date: "2026-09-19" }, px(20 * 60 + 27))).toMatchObject({ startMinutes: 20 * 60 + 30 });
  });

  it("picking it up and putting it back (or nudging it) changes nothing", () => {
    expect(planDrop(day, { kind: "time", date: DATE }, px(20 * 60 + 27))).toBeNull();
    expect(planDrop(day, { kind: "time", date: DATE }, px(20 * 60 + 31))).toBeNull();
  });

  it("resize snaps the end to the grid; a touch of the handle changes nothing", () => {
    const start = 20 * 60 + 27;
    expect(resizedLength(60, px(10), start)).toBe(21 * 60 + 30 - start);
    expect(resizedLength(60, px(-40), start)).toBe(20 * 60 + 45 - start);
    expect(resizedLength(60, px(3), start)).toBe(60);
    expect(resizedLength(60, px(-7), start)).toBe(60);
    expect(resizedLength(60, px(-600), start)).toBe(20 * 60 + 45 - start);
    expect(resizedLength(5, px(20), 23 * 60 + 50)).toBe(10);
  });
});

describe("Detail editors keep 1-minute precision", () => {
  const empty: ScheduleFormValues = { enabled: true, start: "09:00", end: "10:00" };

  it.each([
    ["20:27", "21:27", 20 * 60 + 27, 60],
    ["20:28", "21:13", 20 * 60 + 28, 45],
    ["08:01", "08:06", 8 * 60 + 1, 5],
    ["14:13", "14:29", 14 * 60 + 13, 16],
  ])("saves %s–%s as entered", (start, end, startMinutes, lengthMinutes) => {
    const values = { enabled: true, start, end };
    expect(scheduleFormProblem(values, DATE)).toBeNull();
    expect(planScheduleSave(null, empty, values, DATE)).toEqual({ type: "set", date: DATE, startMinutes, lengthMinutes });
  });

  it("loads existing off-grid times exactly and sends nothing when only other fields change", () => {
    const day = scheduledDay("d", "20:27", "21:27");
    const initial = scheduleFormValues(day);
    expect(initial).toEqual({ enabled: true, start: "20:27", end: "21:27" });
    expect(timeLabel(initial.start)).toBe("오후 8:27");
    expect(timeLabel(initial.end)).toBe("오후 9:27");
    // Title, priority, tags … changed; or the date changed (the server moves the schedule with the same times).
    expect(planScheduleSave(day, initial, initial, DATE)).toEqual({ type: "none" });
    expect(planScheduleSave(day, initial, { ...initial }, "2026-09-20")).toEqual({ type: "none" });
    // A real change of one minute is sent as is.
    expect(planScheduleSave(day, initial, { ...initial, end: "21:28" }, DATE)).toEqual({ type: "set", date: DATE, startMinutes: 20 * 60 + 27, lengthMinutes: 61 });
    // Turning the time off removes only the placement.
    expect(planScheduleSave(day, initial, { ...initial, enabled: false }, DATE)).toEqual({ type: "remove" });
  });

  it("validates only a date and end after start (no multiple-of-15 rule)", () => {
    expect(scheduleFormProblem({ enabled: true, start: "08:06", end: "08:01" }, DATE)).toBe("endBeforeStart");
    expect(scheduleFormProblem({ enabled: true, start: "08:06", end: "08:06" }, DATE)).toBe("endBeforeStart");
    expect(scheduleFormProblem({ enabled: true, start: "08:01", end: "08:06" }, "")).toBe("needsDate");
    expect(scheduleFormProblem({ enabled: true, start: "23:30", end: "24:00" }, DATE)).toBeNull();
    expect(timeLabel("24:00")).toBe("자정 (24:00)");
  });

  it("keeps 20:27 on an Event through the form and back", () => {
    const event: EventResponse = {
      id: "e1",
      title: "면접",
      category: null,
      allDay: false,
      startAt: at("20:27"),
      endAt: at("21:27"),
      startDate: null,
      endDateExclusive: null,
      timezone: "Asia/Seoul",
      location: null,
      notes: null,
      recurrence: "NONE",
      reminders: [],
      linkedGoalId: null,
      createdAt: "",
      updatedAt: "",
      version: 1,
    };
    const values = eventToValues(event);
    expect(values).toMatchObject({ startTime: "20:27", endTime: "21:27" });
    expect(toUpdateEventRequest({ ...values, title: "최종 면접" }, 1)).toMatchObject({ startAt: at("20:27"), endAt: at("21:27") });
    expect(toUpdateEventRequest({ ...values, startTime: "08:01", endTime: "08:06", endDate: DATE, startDate: DATE }, 1)).toMatchObject({ startAt: at("08:01"), endAt: at("08:06") });
    expect(eventFormProblem({ ...values, startTime: "14:13", endTime: "14:29" })).toBeNull();
  });
});

describe("Same minutes on Web and Mobile", () => {
  it("a Web 20:27–21:27 schedule is shown at 20:27 with a 60-minute height", () => {
    // What the API returns for a schedule saved on the Web (offset of the schedule timezone).
    const column = columnPlacement(DATE, [scheduledDay("web", "20:27", "21:27")], []);
    expect(column.days[0]).toMatchObject({ start: 20 * 60 + 27, length: 60 });
    expect(columnGeometry(column).get("day:web")).toMatchObject({ top: px(20 * 60 + 27), timeHeight: px(60) });
  });

  it("a Mobile 20:28–21:13 schedule is sent to the API unchanged", () => {
    const body = scheduleRequest(DATE, 20 * 60 + 28, 45, null, "Asia/Seoul");
    expect(body).toEqual({ startAt: at("20:28"), endAt: at("21:13"), timezone: "Asia/Seoul", expectedVersion: null });
    // Read back the way both clients read schedules (wall clock of the offset date-time).
    expect(wallClock(body.startAt)).toEqual({ date: DATE, minutes: 20 * 60 + 28 });
    expect(wallClock(body.endAt)).toEqual({ date: DATE, minutes: 21 * 60 + 13 });
  });
});
