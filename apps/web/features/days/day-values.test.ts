import type { DayResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import {
  dayToValues,
  describeDaySchedule,
  doneToggleRequest,
  newDayValues,
  quickAddDayRequest,
  toCreateDayRequest,
  toUpdateDayRequest,
} from "./day-values";

const tag = {
  id: "tag-home",
  name: "집안일",
  color: "#9a8fa6",
  sortOrder: 0,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 0,
};

const day: DayResponse = {
  id: "day",
  goalId: "week",
  title: "Write API",
  status: "NOT_STARTED",
  priority: "LOW",
  estimatedMinutes: 60,
  plannedDate: "2026-09-15",
  planningMode: "ANYTIME",
  coreDay: true,
  tags: [tag],
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

  it("DAY-001 sends an unselected Goal as null", () => {
    expect(toCreateDayRequest({ ...newDayValues(), title: "빨래" })).toMatchObject({
      goalId: null,
      plannedDate: null,
      priority: "NONE",
      tagIds: [],
    });
  });

  it("DAY-001 removes the Goal link of an existing Day with an explicit null", () => {
    expect(toUpdateDayRequest({ ...dayToValues(day), goalId: "" }, day.version)).toMatchObject({
      goalId: null,
      version: 3,
    });
  });

  it("DAY-006 quick add only needs a title", () => {
    expect(quickAddDayRequest("  세탁하기  ")).toEqual({
      goalId: null,
      title: "  세탁하기  ",
      status: "NOT_STARTED",
      priority: "NONE",
      estimatedMinutes: 60,
      plannedDate: null,
      planningMode: "ANYTIME",
      coreDay: false,
      tagIds: [],
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
      priority: "LOW",
      estimatedMinutes: 60,
      plannedDate: "2026-09-15",
      planningMode: "ANYTIME",
      coreDay: true,
      tagIds: ["tag-home"],
      version: 3,
    });
  });

  it("toggles done with only status and version so the date and schedule stay", () => {
    expect(doneToggleRequest(day)).toEqual({ status: "DONE", version: 3 });
    expect(doneToggleRequest({ status: "DONE", version: 4 })).toEqual({ status: "NOT_STARTED", version: 4 });
  });

  it("describes date and schedule", () => {
    expect(describeDaySchedule(day)).toBe("2026-09-15 · 19:00 ~ 20:30");
    expect(describeDaySchedule({ plannedDate: "2026-09-15", schedule: null })).toBe("2026-09-15 · 시간 미정");
    expect(describeDaySchedule({ plannedDate: null, schedule: null })).toBe("날짜 미정");
  });
});
