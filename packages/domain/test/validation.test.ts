import { describe, expect, it } from "vitest";
import {
  CONFLICT_ISSUE_CODES,
  changeDayPlannedDate,
  getScheduleLocalDate,
  removeDaySchedule,
  setDaySchedule,
  validateDayGoal,
  validateDayInWeekGoalPeriod,
  validateDayScheduleRange,
  validateDayWithSchedule,
  validateGoalParent,
  validateScheduleInWeekGoalPeriod,
  validateScheduleVersion,
  validateGoalParentReference,
  validateGoalPeriod,
  type Day,
  type DaySchedule,
  type Goal,
} from "../src";

const audit = {
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  version: 1,
};

const yearGoal: Goal = {
  ...audit,
  id: "year-id",
  parentGoalId: null,
  type: "YEAR",
  title: "Annual goal",
  why: "Meaningful outcome",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  priority: 1,
  progressPolicy: "AUTO",
};

const quarterGoal: Goal = {
  ...yearGoal,
  id: "quarter-id",
  parentGoalId: yearGoal.id,
  type: "QUARTER",
  startDate: "2026-01-01",
  endDate: "2026-03-31",
};

const monthGoal: Goal = {
  ...quarterGoal,
  id: "month-id",
  parentGoalId: quarterGoal.id,
  type: "MONTH",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
};

const weekGoal: Goal = {
  ...monthGoal,
  id: "week-id",
  parentGoalId: monthGoal.id,
  type: "WEEK",
  startDate: "2026-01-05",
  endDate: "2026-01-11",
};

const day: Day = {
  ...audit,
  id: "day-id",
  goalId: weekGoal.id,
  title: "Write tests",
  status: "NOT_STARTED",
  priority: 1,
  estimatedMinutes: 30,
  plannedDate: null,
  planningMode: "ANYTIME",
  coreDay: true,
};

const schedule: DaySchedule = {
  ...audit,
  id: "schedule-id",
  dayId: day.id,
  startAt: "2026-09-15T09:00:00+09:00",
  endAt: "2026-09-15T09:30:00+09:00",
  timezone: "Asia/Seoul",
};

describe("GOAL-001 Goal hierarchy", () => {
  it("GOAL-001 accepts the YEAR → QUARTER → MONTH → WEEK hierarchy", () => {
    expect(validateGoalParent(quarterGoal, yearGoal)).toEqual([]);
    expect(validateGoalParent(monthGoal, quarterGoal)).toEqual([]);
    expect(validateGoalParent(weekGoal, monthGoal)).toEqual([]);
  });

  it.each([
    { child: monthGoal, parent: yearGoal, label: "MONTH under YEAR" },
    { child: weekGoal, parent: quarterGoal, label: "WEEK under QUARTER" },
    { child: weekGoal, parent: yearGoal, label: "WEEK under YEAR" },
  ])("GOAL-001 rejects a parent that skips a level ($label)", ({ child, parent }) => {
    const issues = validateGoalParent({ ...child, parentGoalId: parent.id }, parent);

    expect(issues.map((issue) => issue.code)).toEqual(["INVALID_GOAL_PARENT"]);
  });

  it("GOAL-001 rejects a parent that is not the referenced Goal", () => {
    const issues = validateGoalParent(
      { ...quarterGoal, parentGoalId: "other-year-id" },
      yearGoal,
    );

    expect(issues.map((issue) => issue.code)).toEqual(["INVALID_GOAL_PARENT"]);
  });

  it("GOAL-001 requires a parent reference except for YEAR Goals", () => {
    expect(validateGoalParentReference(yearGoal)).toEqual([]);
    expect(validateGoalParentReference(quarterGoal)).toEqual([]);
    expect(
      validateGoalParentReference({ type: "YEAR", parentGoalId: "other-id" }),
    ).toContainEqual(expect.objectContaining({ code: "INVALID_GOAL_PARENT" }));
    expect(
      validateGoalParentReference({ type: "WEEK", parentGoalId: null }),
    ).toContainEqual(expect.objectContaining({ code: "INVALID_GOAL_PARENT" }));
  });

  it("GOAL-001 leaves a missing parent reference to validateGoalParentReference", () => {
    expect(
      validateGoalParent({ ...quarterGoal, parentGoalId: null }, null),
    ).toEqual([]);
  });

  it.each([
    { startDate: "2025-12-01", endDate: "2026-02-28", paths: [["startDate"]] },
    { startDate: "2026-10-01", endDate: "2027-01-10", paths: [["endDate"]] },
    { startDate: "2025-12-01", endDate: "2027-01-10", paths: [["startDate"], ["endDate"]] },
  ])(
    "GOAL-001 reports the field outside its parent period ($startDate ~ $endDate)",
    ({ startDate, endDate, paths }) => {
      const issues = validateGoalParent({ ...quarterGoal, startDate, endDate }, yearGoal);

      expect(issues.map((issue) => issue.code)).toEqual(
        paths.map(() => "GOAL_OUTSIDE_PARENT_PERIOD"),
      );
      expect(issues.map((issue) => issue.path)).toEqual(paths);
    },
  );

  it("GOAL-001 allows a child period outside its parent only after explicit confirmation", () => {
    const outside = { ...quarterGoal, startDate: "2026-10-01", endDate: "2027-01-10" };

    expect(
      validateGoalParent(outside, yearGoal, { allowOutsideParentPeriod: true }),
    ).toEqual([]);
  });

  it("GOAL-001 rejects a period that ends before it starts", () => {
    expect(validateGoalPeriod({ startDate: "2026-03-31", endDate: "2026-01-01" })).toEqual([
      expect.objectContaining({ code: "INVALID_GOAL_PERIOD" }),
    ]);
    expect(validateGoalPeriod({ startDate: "2026-01-01", endDate: "2026-01-01" })).toEqual([]);
  });
});

describe("DAY-001 Day belongs to a WEEK Goal", () => {
  it("DAY-001 accepts a Day attached to its WEEK Goal", () => {
    expect(validateDayGoal({ goalId: weekGoal.id }, weekGoal)).toEqual([]);
  });

  it.each([yearGoal, quarterGoal, monthGoal])(
    "DAY-001 rejects a Day attached to a $type Goal",
    (goal) => {
      expect(validateDayGoal({ goalId: goal.id }, goal)).toContainEqual(
        expect.objectContaining({ code: "DAY_REQUIRES_WEEK_GOAL" }),
      );
    },
  );

  it("DAY-001 accepts a Day without a schedule or planned date", () => {
    expect(validateDayWithSchedule({ day, schedule: null })).toEqual([]);
  });
});

describe("DAY-002 Day schedule", () => {
  it("DAY-002 resolves the schedule date in the schedule timezone", () => {
    const instant = "2026-09-14T15:30:00Z";

    expect(getScheduleLocalDate({ startAt: instant, timezone: "Asia/Seoul" })).toBe(
      "2026-09-15",
    );
    expect(
      getScheduleLocalDate({ startAt: instant, timezone: "America/New_York" }),
    ).toBe("2026-09-14");
  });

  it("DAY-002 moves plannedDate to the schedule date when a schedule is set", () => {
    const result = setDaySchedule({ ...day, plannedDate: "2026-09-14" }, schedule);

    expect(result.day.plannedDate).toBe("2026-09-15");
    expect(result.schedule).toBe(schedule);
    expect(validateDayWithSchedule(result)).toEqual([]);
  });

  it("DAY-002 keeps the Day unchanged when plannedDate already matches", () => {
    const scheduledDay = { ...day, plannedDate: "2026-09-15" };

    expect(setDaySchedule(scheduledDay, schedule).day).toBe(scheduledDay);
  });

  it("DAY-002 replaces the previous schedule so a Day holds at most one", () => {
    const moved: DaySchedule = {
      ...schedule,
      startAt: "2026-09-17T19:00:00+09:00",
      endAt: "2026-09-17T20:00:00+09:00",
    };
    const first = setDaySchedule(day, schedule);
    const second = setDaySchedule(first.day, moved);

    expect(second.schedule).toBe(moved);
    expect(second.day.plannedDate).toBe("2026-09-17");
  });

  it("DAY-002 rejects a schedule that belongs to another Day", () => {
    const result = setDaySchedule(day, { ...schedule, dayId: "other-day-id" });

    expect(validateDayWithSchedule(result)).toEqual([
      expect.objectContaining({ code: "SCHEDULE_DAY_MISMATCH" }),
    ]);
  });

  it("DAY-002 rejects a plannedDate that differs from the schedule date", () => {
    expect(
      validateDayWithSchedule({ day: { ...day, plannedDate: "2026-09-16" }, schedule }),
    ).toEqual([expect.objectContaining({ code: "SCHEDULE_DATE_MISMATCH" })]);
    expect(validateDayWithSchedule({ day, schedule })).toEqual([
      expect.objectContaining({ code: "SCHEDULE_DATE_MISMATCH" }),
    ]);
  });

  it("DAY-002 removes a schedule without removing or changing its Day", () => {
    const scheduled = setDaySchedule(day, schedule);
    const result = removeDaySchedule(scheduled);

    expect(result.day).toBe(scheduled.day);
    expect(result.day.plannedDate).toBe("2026-09-15");
    expect(result.schedule).toBeNull();
  });

  it.each([
    "2026-09-15T09:00:00+09:00",
    "2026-09-15T08:59:00+09:00",
  ])("DAY-002 rejects endAt not after startAt (%s)", (endAt) => {
    expect(validateDayScheduleRange({ startAt: schedule.startAt, endAt })).toEqual([
      expect.objectContaining({ code: "INVALID_SCHEDULE_RANGE" }),
    ]);
  });
});

describe("DAY-002 Schedule optimistic concurrency", () => {
  it("DAY-002 accepts creating a schedule with expectedVersion null", () => {
    expect(validateScheduleVersion(null, null)).toEqual([]);
  });

  it("DAY-002 accepts replacing a schedule with its current version", () => {
    expect(validateScheduleVersion({ version: 3 }, 3)).toEqual([]);
  });

  it.each([
    { current: { version: 1 }, expectedVersion: null, label: "schedule created meanwhile" },
    { current: { version: 4 }, expectedVersion: 3, label: "stale version" },
    { current: null, expectedVersion: 3, label: "schedule removed meanwhile" },
  ])("DAY-002 reports a conflict ($label)", ({ current, expectedVersion }) => {
    const issues = validateScheduleVersion(current, expectedVersion);

    expect(issues.map((issue) => issue.code)).toEqual(["SCHEDULE_VERSION_CONFLICT"]);
    expect(CONFLICT_ISSUE_CODES).toContain(issues[0]?.code);
  });
});

describe("DAY-002 Day and schedule dates stay within the WEEK Goal", () => {
  const week = { startDate: "2026-09-14", endDate: "2026-09-20" };

  it.each([null, "2026-09-14", "2026-09-20"])(
    "DAY-002 accepts plannedDate %s",
    (plannedDate) => {
      expect(validateDayInWeekGoalPeriod({ plannedDate }, week)).toEqual([]);
    },
  );

  it.each(["2026-09-13", "2026-09-21"])(
    "DAY-002 rejects plannedDate %s outside the WEEK Goal",
    (plannedDate) => {
      expect(validateDayInWeekGoalPeriod({ plannedDate }, week)).toEqual([
        expect.objectContaining({
          code: "DATE_OUTSIDE_WEEK_GOAL_PERIOD",
          path: ["plannedDate"],
        }),
      ]);
    },
  );

  it("DAY-002 checks the schedule date in its own timezone", () => {
    // 2026-09-20 15:30 UTC is 2026-09-21 00:30 in Seoul.
    const lateSunday = { startAt: "2026-09-20T15:30:00Z", timezone: "Asia/Seoul" };

    expect(validateScheduleInWeekGoalPeriod(lateSunday, week)).toEqual([
      expect.objectContaining({ code: "DATE_OUTSIDE_WEEK_GOAL_PERIOD", path: ["startAt"] }),
    ]);
    expect(
      validateScheduleInWeekGoalPeriod({ ...lateSunday, timezone: "UTC" }, week),
    ).toEqual([]);
  });
});

describe("DAY-002 Changing plannedDate of a scheduled Day", () => {
  const eveningSchedule: DaySchedule = {
    ...schedule,
    startAt: "2026-09-15T19:00:00+09:00",
    endAt: "2026-09-15T20:30:00+09:00",
  };
  const scheduled = setDaySchedule(day, eveningSchedule);

  it("DAY-002 moves the schedule keeping timezone, local start time and duration", () => {
    const result = changeDayPlannedDate(scheduled, "2026-09-17");

    expect(result.day.plannedDate).toBe("2026-09-17");
    expect(result.schedule).toEqual({
      ...eveningSchedule,
      startAt: "2026-09-17T19:00:00+09:00",
      endAt: "2026-09-17T20:30:00+09:00",
    });
    expect(validateDayWithSchedule(result)).toEqual([]);
  });

  it("DAY-002 keeps the local start time across a DST change", () => {
    const newYork: DaySchedule = {
      ...schedule,
      startAt: "2026-10-30T09:00:00-04:00",
      endAt: "2026-10-30T10:00:00-04:00",
      timezone: "America/New_York",
    };
    const result = changeDayPlannedDate(setDaySchedule(day, newYork), "2026-11-02");

    expect(result.schedule?.startAt).toBe("2026-11-02T09:00:00-05:00");
    expect(result.schedule?.endAt).toBe("2026-11-02T10:00:00-05:00");
  });

  it("DAY-002 removes the schedule but keeps the Day when plannedDate becomes null", () => {
    const result = changeDayPlannedDate(scheduled, null);

    expect(result.schedule).toBeNull();
    expect(result.day).toEqual({ ...scheduled.day, plannedDate: null });
  });

  it("DAY-002 only changes the date of a Day without a schedule", () => {
    const result = changeDayPlannedDate({ day, schedule: null }, "2026-09-16");

    expect(result).toEqual({ day: { ...day, plannedDate: "2026-09-16" }, schedule: null });
  });

  it("DAY-002 keeps the schedule unchanged when the date does not change", () => {
    const result = changeDayPlannedDate(scheduled, "2026-09-15");

    expect(result.day).toBe(scheduled.day);
    expect(result.schedule).toBe(eveningSchedule);
  });
});
