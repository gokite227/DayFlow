import type { Day, Goal } from "@dayflow/domain";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  createDaySchema,
  createDaySchemaForGoal,
  createGoalSchema,
  createGoalSchemaForParent,
  dayScheduleSchema,
  setDayScheduleSchema,
  updateDaySchemaForCurrentDay,
  updateGoalSchemaForCurrentGoal,
} from "../src";

const ids = {
  year: "10000000-0000-4000-8000-000000000001",
  week: "10000000-0000-4000-8000-000000000002",
  day: "10000000-0000-4000-8000-000000000003",
  schedule: "10000000-0000-4000-8000-000000000004",
  quarter: "10000000-0000-4000-8000-000000000005",
  nextWeek: "10000000-0000-4000-8000-000000000007",
};

const audit = {
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  version: 1,
};

const yearGoal: Goal = {
  ...audit,
  id: ids.year,
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
  id: ids.quarter,
  parentGoalId: ids.year,
  type: "QUARTER",
  title: "First quarter",
  startDate: "2026-01-01",
  endDate: "2026-03-31",
};

const weekGoal: Goal = {
  ...yearGoal,
  id: ids.week,
  parentGoalId: "10000000-0000-4000-8000-000000000006",
  type: "WEEK",
  title: "Week goal",
  startDate: "2026-09-14",
  endDate: "2026-09-20",
};

const validQuarterInput = {
  parentGoalId: ids.year,
  type: "QUARTER" as const,
  title: "First quarter",
  why: "Build foundations",
  startDate: "2026-01-01",
  endDate: "2026-03-31",
  priority: 1,
  progressPolicy: "AUTO" as const,
};

const validDayInput = {
  goalId: ids.week as string | null,
  title: "Implement domain foundation",
  status: "NOT_STARTED" as const,
  priority: "LOW" as const,
  estimatedMinutes: 60,
  plannedDate: null,
  planningMode: "ANYTIME" as const,
  coreDay: true,
  tagIds: [] as string[],
};

const currentDay: Day = {
  ...audit,
  ...validDayInput,
  id: ids.day,
  plannedDate: "2026-09-15",
};

/** Domain codes reported through addDomainIssues, in order. */
function domainCodes(issues: readonly z.core.$ZodIssue[] | undefined): unknown[] {
  return (issues ?? []).flatMap((issue) =>
    issue.code === "custom" && issue.params?.domainCode !== undefined
      ? [issue.params.domainCode]
      : [],
  );
}

describe("GOAL-001 Goal create schemas", () => {
  it("GOAL-001 accepts a QUARTER Goal under its YEAR Goal", () => {
    expect(createGoalSchemaForParent(yearGoal).safeParse(validQuarterInput).success).toBe(
      true,
    );
  });

  it("GOAL-001 rejects a parent that skips a level (MONTH under YEAR)", () => {
    const result = createGoalSchemaForParent(yearGoal).safeParse({
      ...validQuarterInput,
      type: "MONTH",
      endDate: "2026-01-31",
    });

    expect(domainCodes(result.error?.issues)).toEqual(["INVALID_GOAL_PARENT"]);
  });

  // Canonical quarters of the neighbouring years, so only the parent period rule fails.
  it.each([
    { startDate: "2025-10-01", endDate: "2025-12-31", path: ["startDate"] },
    { startDate: "2027-01-01", endDate: "2027-03-31", path: ["endDate"] },
  ])(
    "GOAL-001 reports a Goal outside its parent period on $path",
    ({ startDate, endDate, path }) => {
      const result = createGoalSchemaForParent(yearGoal).safeParse({
        ...validQuarterInput,
        startDate,
        endDate,
      });

      expect(domainCodes(result.error?.issues)).toEqual(["GOAL_OUTSIDE_PARENT_PERIOD"]);
      expect(result.error?.issues[0]?.path).toEqual(path);
    },
  );

  it("GOAL-001 accepts a Goal outside its parent period after explicit confirmation", () => {
    const result = createGoalSchemaForParent(yearGoal, {
      allowOutsideParentPeriod: true,
    }).safeParse({ ...validQuarterInput, startDate: "2027-01-01", endDate: "2027-03-31" });

    expect(result.success).toBe(true);
  });

  it("GOAL-004 rejects a free date range that is not one calendar period", () => {
    const result = createGoalSchemaForParent(yearGoal).safeParse({
      ...validQuarterInput,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });

    expect(domainCodes(result.error?.issues)).toEqual(["INVALID_GOAL_PERIOD"]);
  });

  it("GOAL-001 reports a missing parent reference once", () => {
    const result = createGoalSchemaForParent(null).safeParse({
      ...validQuarterInput,
      parentGoalId: null,
    });

    expect(result.error?.issues).toHaveLength(1);
    expect(domainCodes(result.error?.issues)).toEqual(["INVALID_GOAL_PARENT"]);
  });

  it("GOAL-001 reports a parent on a YEAR Goal once", () => {
    const result = createGoalSchemaForParent(null).safeParse({
      ...validQuarterInput,
      type: "YEAR",
      endDate: "2026-12-31",
    });

    expect(result.error?.issues).toHaveLength(1);
    expect(domainCodes(result.error?.issues)).toEqual(["INVALID_GOAL_PARENT"]);
  });

  it("GOAL-001 reports a reversed period once", () => {
    const result = createGoalSchemaForParent(yearGoal).safeParse({
      ...validQuarterInput,
      startDate: "2026-03-31",
      endDate: "2026-01-01",
    });

    expect(result.error?.issues).toHaveLength(1);
    expect(domainCodes(result.error?.issues)).toEqual(["INVALID_GOAL_PERIOD"]);
  });

  it("GOAL-001 rejects an impossible calendar date", () => {
    expect(
      createGoalSchema.safeParse({ ...validQuarterInput, endDate: "2026-02-30" }).success,
    ).toBe(false);
  });

  it("GOAL-001 rejects unknown fields", () => {
    expect(
      createGoalSchema.safeParse({ ...validQuarterInput, userId: ids.day }).success,
    ).toBe(false);
  });
});

describe("GOAL-001 Goal update schemas", () => {
  const schema = updateGoalSchemaForCurrentGoal(quarterGoal, yearGoal);

  it("GOAL-001 accepts a field update that keeps the hierarchy valid", () => {
    expect(schema.safeParse({ title: "Renamed", version: 1 }).success).toBe(true);
  });

  it("GOAL-001 rejects moving a Goal outside its parent period", () => {
    const result = schema.safeParse({ startDate: "2027-01-01", endDate: "2027-03-31", version: 1 });

    expect(domainCodes(result.error?.issues)).toEqual(["GOAL_OUTSIDE_PARENT_PERIOD"]);
  });

  it("GOAL-001 rejects an endDate before the current startDate", () => {
    const result = schema.safeParse({ endDate: "2025-12-31", version: 1 });

    expect(domainCodes(result.error?.issues)).toContain("INVALID_GOAL_PERIOD");
  });

  it("GOAL-001 rejects removing the parent reference of a QUARTER Goal", () => {
    const result = updateGoalSchemaForCurrentGoal(quarterGoal, null).safeParse({
      parentGoalId: null,
      version: 1,
    });

    expect(domainCodes(result.error?.issues)).toEqual(["INVALID_GOAL_PARENT"]);
  });

  it("GOAL-001 rejects an update without any Goal field", () => {
    expect(schema.safeParse({ version: 1 }).success).toBe(false);
  });
});

describe("DAY-001 Day schemas", () => {
  it("DAY-001 accepts a Day without a planned date", () => {
    expect(createDaySchema.safeParse(validDayInput).success).toBe(true);
  });

  it("DAY-001 accepts a Day attached to a WEEK Goal", () => {
    expect(createDaySchemaForGoal(weekGoal).safeParse(validDayInput).success).toBe(true);
  });

  it("DAY-001 rejects a Day attached to a non-WEEK Goal", () => {
    const result = createDaySchemaForGoal(yearGoal).safeParse(validDayInput);

    expect(domainCodes(result.error?.issues)).toEqual(["DAY_REQUIRES_WEEK_GOAL"]);
  });

  it("DAY-001 rejects moving a Day to a non-WEEK Goal", () => {
    const result = updateDaySchemaForCurrentDay(currentDay, yearGoal).safeParse({
      goalId: ids.year,
      version: 1,
    });

    expect(domainCodes(result.error?.issues)).toEqual(["DAY_REQUIRES_WEEK_GOAL"]);
  });

  it("DAY-001 accepts a Day without a Goal, with any date", () => {
    const goalless = { ...validDayInput, goalId: null, plannedDate: "2027-05-05" };

    expect(createDaySchema.safeParse(goalless).success).toBe(true);
    // No Goal means no Goal period to stay inside.
    expect(createDaySchemaForGoal(null).safeParse(goalless).success).toBe(true);
  });

  it("DAY-001 accepts removing the Goal link of a dated Day", () => {
    expect(
      updateDaySchemaForCurrentDay(currentDay, null).safeParse({ goalId: null, version: 1 }).success,
    ).toBe(true);
  });

  it("DAY-004 rejects a priority outside NONE/LOW/MEDIUM/HIGH", () => {
    expect(createDaySchema.safeParse({ ...validDayInput, priority: "URGENT" }).success).toBe(false);
    expect(createDaySchema.safeParse({ ...validDayInput, priority: 1 }).success).toBe(false);
    expect(createDaySchema.safeParse({ ...validDayInput, priority: "HIGH" }).success).toBe(true);
  });

  it("DAY-005 accepts up to 10 distinct Tags", () => {
    const tagIds = Array.from({ length: 10 }, (_, index) => `10000000-0000-4000-8000-0000000001${index.toString().padStart(2, "0")}`);

    expect(createDaySchema.safeParse({ ...validDayInput, tagIds }).success).toBe(true);
    expect(createDaySchema.safeParse({ ...validDayInput, tagIds: [...tagIds, ids.week] }).success).toBe(false);
    expect(
      createDaySchema.safeParse({ ...validDayInput, tagIds: [ids.week, ids.week] }).success,
    ).toBe(false);
  });
});

describe("DAY-002 Day dates stay within the WEEK Goal", () => {
  const nextWeekGoal: Goal = {
    ...weekGoal,
    id: ids.nextWeek,
    startDate: "2026-09-21",
    endDate: "2026-09-27",
  };

  it("DAY-002 accepts a plannedDate within the WEEK Goal", () => {
    expect(
      createDaySchemaForGoal(weekGoal).safeParse({ ...validDayInput, plannedDate: "2026-09-20" })
        .success,
    ).toBe(true);
  });

  it("DAY-002 rejects a plannedDate outside the WEEK Goal on create", () => {
    const result = createDaySchemaForGoal(weekGoal).safeParse({
      ...validDayInput,
      plannedDate: "2026-09-21",
    });

    expect(domainCodes(result.error?.issues)).toEqual(["DATE_OUTSIDE_WEEK_GOAL_PERIOD"]);
    expect(result.error?.issues[0]?.path).toEqual(["plannedDate"]);
  });

  it("DAY-002 reports only the WEEK Goal error for a non-WEEK Goal", () => {
    const result = createDaySchemaForGoal(yearGoal).safeParse({
      ...validDayInput,
      goalId: ids.year,
      plannedDate: "2027-01-01",
    });

    expect(domainCodes(result.error?.issues)).toEqual(["DAY_REQUIRES_WEEK_GOAL"]);
  });

  it("DAY-002 rejects moving plannedDate outside the WEEK Goal on update", () => {
    const result = updateDaySchemaForCurrentDay(currentDay, weekGoal).safeParse({
      plannedDate: "2026-09-22",
      version: 1,
    });

    expect(domainCodes(result.error?.issues)).toEqual(["DATE_OUTSIDE_WEEK_GOAL_PERIOD"]);
  });

  it("DAY-002 rejects moving a dated Day to another week without changing its date", () => {
    const result = updateDaySchemaForCurrentDay(currentDay, nextWeekGoal).safeParse({
      goalId: ids.nextWeek,
      version: 1,
    });

    expect(domainCodes(result.error?.issues)).toEqual(["DATE_OUTSIDE_WEEK_GOAL_PERIOD"]);
  });

  it("DAY-002 accepts clearing plannedDate", () => {
    expect(
      updateDaySchemaForCurrentDay(currentDay, weekGoal).safeParse({
        plannedDate: null,
        version: 1,
      }).success,
    ).toBe(true);
  });
});

describe("DAY-002 Schedule schemas", () => {
  const timeFields = {
    startAt: "2026-09-15T09:00:00+09:00",
    endAt: "2026-09-15T10:00:00+09:00",
    timezone: "Asia/Seoul",
  };
  const validInput = { ...timeFields, expectedVersion: null };
  const validSchedule = {
    ...audit,
    ...timeFields,
    id: ids.schedule,
    dayId: ids.day,
  };

  it("DAY-002 accepts a PUT schedule body that creates a schedule", () => {
    expect(setDayScheduleSchema.safeParse(validInput).success).toBe(true);
  });

  it("DAY-002 accepts a PUT schedule body that replaces a known version", () => {
    expect(setDayScheduleSchema.safeParse({ ...validInput, expectedVersion: 3 }).success).toBe(
      true,
    );
  });

  it.each([
    { label: "missing", body: timeFields },
    { label: "negative", body: { ...timeFields, expectedVersion: -1 } },
    { label: "fractional", body: { ...timeFields, expectedVersion: 1.5 } },
  ])("DAY-002 rejects a $label expectedVersion", ({ body }) => {
    expect(setDayScheduleSchema.safeParse(body).success).toBe(false);
  });

  it.each([
    ["id", ids.schedule],
    ["dayId", ids.day],
    ["version", 1],
  ])("DAY-002 rejects server-owned field %s in the PUT schedule body", (field, value) => {
    expect(setDayScheduleSchema.safeParse({ ...validInput, [field]: value }).success).toBe(
      false,
    );
  });

  it.each([
    "2026-09-15T09:00:00+09:00",
    "2026-09-15T08:59:00+09:00",
  ])("DAY-002 rejects endAt not after startAt (%s)", (endAt) => {
    const result = setDayScheduleSchema.safeParse({ ...validInput, endAt });

    expect(domainCodes(result.error?.issues)).toEqual(["INVALID_SCHEDULE_RANGE"]);
  });

  it("DAY-002 rejects an unknown timezone", () => {
    expect(
      setDayScheduleSchema.safeParse({ ...validInput, timezone: "Mars/Olympus" }).success,
    ).toBe(false);
  });

  it("DAY-002 accepts a stored schedule entity with versioning fields", () => {
    expect(dayScheduleSchema.safeParse(validSchedule).success).toBe(true);
  });

  it("DAY-002 rejects a stored schedule entity without a version", () => {
    const { version: _version, ...withoutVersion } = validSchedule;

    expect(dayScheduleSchema.safeParse(withoutVersion).success).toBe(false);
  });
});
