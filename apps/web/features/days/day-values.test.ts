import type { DayResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { dayToValues, describeDaySchedule, newDayValues, toCreateDayRequest, toUpdateDayRequest } from "./day-values";

const day: DayResponse = {
  id: "day",
  goalId: "week",
  title: "Write API",
  status: "NOT_STARTED",
  priority: 1,
  estimatedMinutes: 60,
  plannedDate: "2026-09-15",
  planningMode: "ANYTIME",
  coreDay: true,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 3,
  schedule: {
    id: "schedule",
    dayId: "day",
    startAt: "2026-09-15T19:00:00+09:00",
    endAt: "2026-09-15T20:30:00+09:00",
    timezone: "Asia/Seoul",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    version: 0,
  },
};

describe("DAY-001 / DAY-002 form values", () => {
  it("sends a Day without a date as plannedDate null", () => {
    expect(toCreateDayRequest({ ...newDayValues("week"), title: "No date" })).toMatchObject({
      goalId: "week",
      plannedDate: null,
      status: "NOT_STARTED",
      estimatedMinutes: 60,
    });
  });

  it("clears the date with an explicit null on update and keeps the version", () => {
    expect(toUpdateDayRequest({ ...dayToValues(day), plannedDate: "" }, day.version)).toMatchObject({
      plannedDate: null,
      version: 3,
    });
  });

  it("round-trips a Day through form values", () => {
    expect(toUpdateDayRequest(dayToValues(day), day.version)).toEqual({
      goalId: "week",
      title: "Write API",
      status: "NOT_STARTED",
      priority: 1,
      estimatedMinutes: 60,
      plannedDate: "2026-09-15",
      planningMode: "ANYTIME",
      coreDay: true,
      version: 3,
    });
  });

  it("describes date and schedule", () => {
    expect(describeDaySchedule(day)).toBe("2026-09-15 · 19:00 ~ 20:30");
    expect(describeDaySchedule({ plannedDate: "2026-09-15", schedule: null })).toBe("2026-09-15 · 시간 미정");
    expect(describeDaySchedule({ plannedDate: null, schedule: null })).toBe("날짜 미정");
  });
});
