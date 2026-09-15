import type { DayResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { planDrop } from "./calendar-drop";
import {
  CALENDAR_SNAP_MINUTES,
  addDays,
  defaultScheduleLength,
  formatWeekRange,
  scheduleRequest,
  snapMinutes,
  startOfWeek,
  toLocalDate,
  wallClock,
  weekDates,
} from "./calendar-time";

const HOUR = 48;
const px = (minutes: number) => (minutes / 60) * HOUR;

const dateOnlyDay: DayResponse = {
  id: "day",
  goalId: "week",
  title: "Write API",
  status: "NOT_STARTED",
  priority: 1,
  estimatedMinutes: 50,
  plannedDate: "2026-09-15",
  planningMode: "ANYTIME",
  coreDay: false,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 2,
  schedule: null,
};

const unscheduledDay: DayResponse = { ...dateOnlyDay, plannedDate: null };

const scheduledDay: DayResponse = {
  ...dateOnlyDay,
  schedule: {
    id: "schedule",
    dayId: "day",
    startAt: "2026-09-15T10:00:00+09:00",
    endAt: "2026-09-15T11:00:00+09:00",
    timezone: "Asia/Seoul",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    version: 4,
  },
};

describe("15-minute snap", () => {
  it("uses one shared 15-minute step", () => {
    expect(CALENDAR_SNAP_MINUTES).toBe(15);
    expect(snapMinutes(10 * 60 + 7)).toBe(10 * 60);
    expect(snapMinutes(10 * 60 + 8)).toBe(10 * 60 + 15);
    expect(snapMinutes(10 * 60 + 22)).toBe(10 * 60 + 15);
    expect(snapMinutes(10 * 60 + 38)).toBe(10 * 60 + 45);
  });

  it("derives a default length from the estimate, at least 15 minutes", () => {
    expect(defaultScheduleLength(50)).toBe(45);
    expect(defaultScheduleLength(53)).toBe(60);
    expect(defaultScheduleLength(5)).toBe(15);
  });
});

describe("DAY-002 calendar week helpers", () => {
  it("starts weeks on Monday and formats the range", () => {
    expect(startOfWeek("2026-09-15")).toBe("2026-09-14");
    expect(startOfWeek("2026-09-20")).toBe("2026-09-14");
    expect(weekDates("2026-09-14")[6]).toBe("2026-09-20");
    expect(formatWeekRange(weekDates("2026-09-14"))).toBe("Sep 14 – Sep 20");
    expect(formatWeekRange(weekDates("2026-09-28"))).toBe("Sep 28 – Oct 4");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("reads the wall-clock date and time from the server offset", () => {
    expect(wallClock("2026-09-15T19:30:00+09:00")).toEqual({ date: "2026-09-15", minutes: 19 * 60 + 30 });
  });
});

describe("DAY-002 schedule requests use optimistic concurrency", () => {
  it("creates with expectedVersion null and replaces with the current version", () => {
    expect(scheduleRequest("2026-09-15", 9 * 60, 60, null, "Asia/Seoul").expectedVersion).toBeNull();
    expect(scheduleRequest("2026-09-15", 9 * 60, 60, scheduledDay.schedule, "Asia/Seoul").expectedVersion).toBe(4);
  });

  it("builds instants for the local date and time", () => {
    const body = scheduleRequest("2026-09-15", 9 * 60 + 45, 75, null, "Asia/Seoul");
    const start = new Date(body.startAt);

    expect(toLocalDate(start)).toBe("2026-09-15");
    expect(start.getHours() * 60 + start.getMinutes()).toBe(9 * 60 + 45);
    expect(Date.parse(body.endAt) - Date.parse(body.startAt)).toBe(75 * 60_000);
  });
});

describe("DAY-002 calendar drops", () => {
  it("Unscheduled → date-only area sets only the date", () => {
    expect(planDrop(unscheduledDay, { kind: "date", date: "2026-09-16" }, 0, HOUR)).toEqual({
      type: "moveDate",
      date: "2026-09-16",
    });
  });

  it("Unscheduled or date-only → time slot creates a schedule snapped to 15 minutes", () => {
    expect(planDrop(unscheduledDay, { kind: "time", date: "2026-09-16" }, px(10 * 60 + 22), HOUR)).toEqual({
      type: "setSchedule",
      date: "2026-09-16",
      startMinutes: 10 * 60 + 15,
      lengthMinutes: 45,
    });
    expect(planDrop(dateOnlyDay, { kind: "time", date: "2026-09-15" }, px(10 * 60 + 7), HOUR)).toMatchObject({
      startMinutes: 10 * 60,
    });
  });

  it("date-only → another date moves the date", () => {
    expect(planDrop(dateOnlyDay, { kind: "date", date: "2026-09-18" }, 0, HOUR)).toEqual({
      type: "moveDate",
      date: "2026-09-18",
    });
    expect(planDrop(dateOnlyDay, { kind: "date", date: "2026-09-15" }, 0, HOUR)).toBeNull();
  });

  it("scheduled → another time or date keeps the duration", () => {
    expect(planDrop(scheduledDay, { kind: "time", date: "2026-09-17" }, px(14 * 60 + 30), HOUR)).toEqual({
      type: "setSchedule",
      date: "2026-09-17",
      startMinutes: 14 * 60 + 30,
      lengthMinutes: 60,
    });
    expect(planDrop(scheduledDay, { kind: "time", date: "2026-09-15" }, px(10 * 60 + 5), HOUR)).toBeNull();
  });

  it("keeps the block inside the day", () => {
    expect(planDrop(scheduledDay, { kind: "time", date: "2026-09-15" }, px(23 * 60 + 50), HOUR)).toMatchObject({
      startMinutes: 23 * 60,
    });
    expect(planDrop(scheduledDay, { kind: "time", date: "2026-09-15" }, -50, HOUR)).toMatchObject({ startMinutes: 0 });
  });

  it("scheduled → date-only area removes only the schedule (and moves the date if needed)", () => {
    expect(planDrop(scheduledDay, { kind: "date", date: "2026-09-15" }, 0, HOUR)).toEqual({
      type: "unschedule",
      moveToDate: null,
    });
    expect(planDrop(scheduledDay, { kind: "date", date: "2026-09-18" }, 0, HOUR)).toEqual({
      type: "unschedule",
      moveToDate: "2026-09-18",
    });
  });

  it("dated Day → Unscheduled clears the date", () => {
    expect(planDrop(scheduledDay, { kind: "unscheduled" }, 0, HOUR)).toEqual({ type: "moveDate", date: null });
    expect(planDrop(unscheduledDay, { kind: "unscheduled" }, 0, HOUR)).toBeNull();
  });
});
