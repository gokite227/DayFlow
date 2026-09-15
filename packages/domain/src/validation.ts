import type {
  CreateGoalInput,
  CreateDayInput,
  Day,
  DaySchedule,
  DayWithSchedule,
  Goal,
  GoalType,
  LocalDate,
} from "./types";
import {
  formatLocalDate,
  formatOffsetDateTime,
  getZonedDateTimeParts,
  parseLocalDate,
  zonedDateTimeToInstant,
} from "./zoned-time";

export type DomainIssueCode =
  | "INVALID_GOAL_PERIOD"
  | "INVALID_GOAL_PARENT"
  | "GOAL_OUTSIDE_PARENT_PERIOD"
  | "DAY_REQUIRES_WEEK_GOAL"
  | "DATE_OUTSIDE_WEEK_GOAL_PERIOD"
  | "INVALID_SCHEDULE_RANGE"
  | "SCHEDULE_DAY_MISMATCH"
  | "SCHEDULE_DATE_MISMATCH"
  | "SCHEDULE_VERSION_CONFLICT";

export interface DomainIssue {
  code: DomainIssueCode;
  message: string;
  path: readonly string[];
}

/**
 * Codes meaning the stored state changed after the client read it, not that the
 * input is invalid. An API maps these to a conflict (HTTP 409) so the client can
 * reload and retry.
 */
export const CONFLICT_ISSUE_CODES: readonly DomainIssueCode[] = [
  "SCHEDULE_VERSION_CONFLICT",
];

export interface GoalParentValidationOptions {
  /** Set only after an explicit product-level confirmation to exceed the parent period. */
  allowOutsideParentPeriod?: boolean;
}

const EXPECTED_PARENT_TYPE: Readonly<Partial<Record<GoalType, GoalType>>> = {
  QUARTER: "YEAR",
  MONTH: "QUARTER",
  WEEK: "MONTH",
};

export function getExpectedParentGoalType(type: GoalType): GoalType | null {
  return EXPECTED_PARENT_TYPE[type] ?? null;
}

export function isGoalPeriodOrdered(
  goal: Pick<Goal, "startDate" | "endDate">,
): boolean {
  return goal.startDate <= goal.endDate;
}

/** Owns the rule that a Goal period must not end before it starts. */
export function validateGoalPeriod(
  goal: Pick<Goal, "startDate" | "endDate">,
): DomainIssue[] {
  return isGoalPeriodOrdered(goal)
    ? []
    : [
        {
          code: "INVALID_GOAL_PERIOD",
          message: "Goal endDate must be on or after startDate.",
          path: ["endDate"],
        },
      ];
}

/**
 * Owns the rule that only YEAR Goals are roots and every other type references
 * a parent. It needs no parent entity, so it can run before the parent is loaded.
 */
export function validateGoalParentReference(
  goal: Pick<Goal, "type" | "parentGoalId">,
): DomainIssue[] {
  const expectedParentType = getExpectedParentGoalType(goal.type);

  if (expectedParentType === null && goal.parentGoalId !== null) {
    return [
      {
        code: "INVALID_GOAL_PARENT",
        message: "A YEAR Goal cannot have a parent Goal.",
        path: ["parentGoalId"],
      },
    ];
  }
  if (expectedParentType !== null && goal.parentGoalId === null) {
    return [
      {
        code: "INVALID_GOAL_PARENT",
        message: `A ${goal.type} Goal requires a ${expectedParentType} parent Goal.`,
        path: ["parentGoalId"],
      },
    ];
  }
  return [];
}

/**
 * Owns the rules that need the loaded parent: it must be the Goal referenced by
 * parentGoalId, exactly one level above the child, and contain the child period.
 * A missing or forbidden reference is reported by validateGoalParentReference.
 */
export function validateGoalParent(
  child: Pick<CreateGoalInput, "type" | "parentGoalId" | "startDate" | "endDate">,
  parent: Pick<Goal, "id" | "type" | "startDate" | "endDate"> | null,
  options: GoalParentValidationOptions = {},
): DomainIssue[] {
  const expectedParentType = getExpectedParentGoalType(child.type);

  if (expectedParentType === null || child.parentGoalId === null) {
    return [];
  }

  if (
    parent === null ||
    child.parentGoalId !== parent.id ||
    parent.type !== expectedParentType
  ) {
    return [
      {
        code: "INVALID_GOAL_PARENT",
        message: `A ${child.type} Goal must have a ${expectedParentType} Goal as its parent.`,
        path: ["parentGoalId"],
      },
    ];
  }

  if (options.allowOutsideParentPeriod) {
    return [];
  }

  const issues: DomainIssue[] = [];
  if (child.startDate < parent.startDate) {
    issues.push({
      code: "GOAL_OUTSIDE_PARENT_PERIOD",
      message: "A child Goal must not start before its parent Goal.",
      path: ["startDate"],
    });
  }
  if (child.endDate > parent.endDate) {
    issues.push({
      code: "GOAL_OUTSIDE_PARENT_PERIOD",
      message: "A child Goal must not end after its parent Goal.",
      path: ["endDate"],
    });
  }
  return issues;
}

export function validateDayGoal(
  day: Pick<CreateDayInput, "goalId">,
  goal: Pick<Goal, "id" | "type"> | null,
): DomainIssue[] {
  return goal !== null && day.goalId === goal.id && goal.type === "WEEK"
    ? []
    : [
        {
          code: "DAY_REQUIRES_WEEK_GOAL",
          message: "A Day can only belong directly to its resolved WEEK Goal.",
          path: ["goalId"],
        },
      ];
}

function isDateInGoalPeriod(
  date: LocalDate,
  goal: Pick<Goal, "startDate" | "endDate">,
): boolean {
  return goal.startDate <= date && date <= goal.endDate;
}

/**
 * Owns the rule that a Day's plannedDate lies within its WEEK Goal period, for
 * Day edits. A Day without a date is valid. Moving to another week is a
 * separate replan/defer use case.
 */
export function validateDayInWeekGoalPeriod(
  day: Pick<Day, "plannedDate">,
  goal: Pick<Goal, "startDate" | "endDate">,
): DomainIssue[] {
  return day.plannedDate === null || isDateInGoalPeriod(day.plannedDate, goal)
    ? []
    : [
        {
          code: "DATE_OUTSIDE_WEEK_GOAL_PERIOD",
          message: "Day plannedDate must be within its WEEK Goal period.",
          path: ["plannedDate"],
        },
      ];
}

/**
 * The same WEEK Goal period rule for schedule edits, reported on startAt. The
 * schedule date is its local start date. Expects a schema-validated schedule.
 */
export function validateScheduleInWeekGoalPeriod(
  schedule: Pick<DaySchedule, "startAt" | "timezone">,
  goal: Pick<Goal, "startDate" | "endDate">,
): DomainIssue[] {
  return isDateInGoalPeriod(getScheduleLocalDate(schedule), goal)
    ? []
    : [
        {
          code: "DATE_OUTSIDE_WEEK_GOAL_PERIOD",
          message: "DaySchedule date must be within the Day's WEEK Goal period.",
          path: ["startAt"],
        },
      ];
}

/**
 * Optimistic concurrency for setting a schedule: expectedVersion must be null
 * when the Day has no schedule and equal the current version when it has one.
 */
export function validateScheduleVersion(
  current: Pick<DaySchedule, "version"> | null,
  expectedVersion: number | null,
): DomainIssue[] {
  const currentVersion = current === null ? null : current.version;

  return currentVersion === expectedVersion
    ? []
    : [
        {
          code: "SCHEDULE_VERSION_CONFLICT",
          message: "The schedule was changed by another request. Reload and try again.",
          path: ["expectedVersion"],
        },
      ];
}

export function validateDayScheduleRange(
  schedule: Pick<DaySchedule, "startAt" | "endAt">,
): DomainIssue[] {
  const start = Date.parse(schedule.startAt);
  const end = Date.parse(schedule.endAt);

  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? []
    : [
        {
          code: "INVALID_SCHEDULE_RANGE",
          message: "DaySchedule endAt must be after startAt.",
          path: ["endAt"],
        },
      ];
}

/**
 * Returns the calendar date on which the schedule starts, in the schedule's own
 * timezone. Expects a schema-validated startAt and IANA timezone.
 */
export function getScheduleLocalDate(
  schedule: Pick<DaySchedule, "startAt" | "timezone">,
): LocalDate {
  return formatLocalDate(
    getZonedDateTimeParts(Date.parse(schedule.startAt), schedule.timezone),
  );
}

/**
 * Checks that a Day and its schedule agree: the schedule belongs to the Day and
 * starts on Day.plannedDate. The time range is owned by validateDayScheduleRange.
 */
export function validateDayWithSchedule({
  day,
  schedule,
}: DayWithSchedule): DomainIssue[] {
  if (schedule === null) {
    return [];
  }

  if (schedule.dayId !== day.id) {
    return [
      {
        code: "SCHEDULE_DAY_MISMATCH",
        message: "DaySchedule dayId must match the Day it is attached to.",
        path: ["dayId"],
      },
    ];
  }

  // An unparsable startAt is already reported by validateDayScheduleRange.
  if (!Number.isFinite(Date.parse(schedule.startAt))) {
    return [];
  }

  return day.plannedDate === getScheduleLocalDate(schedule)
    ? []
    : [
        {
          code: "SCHEDULE_DATE_MISMATCH",
          message: "Day plannedDate must equal the date of its schedule.",
          path: ["plannedDate"],
        },
      ];
}

/**
 * Places a Day on the calendar. The result holds only this schedule, replacing
 * any previous one, and Day.plannedDate is moved to the schedule's date.
 * Before calling, check validateScheduleVersion and
 * validateScheduleInWeekGoalPeriod; run validateDayWithSchedule on the result
 * to confirm the schedule's dayId. version/updatedAt are left to the
 * persistence layer.
 */
export function setDaySchedule(day: Day, schedule: DaySchedule): DayWithSchedule {
  const plannedDate = getScheduleLocalDate(schedule);

  return {
    day: day.plannedDate === plannedDate ? day : { ...day, plannedDate },
    schedule,
  };
}

/**
 * Changes Day.plannedDate and keeps its schedule on the same date:
 * - null removes the schedule; the Day itself is kept.
 * - a date moves the schedule there, keeping its timezone, local start time
 *   and duration.
 * Validate the result with validateDayInWeekGoalPeriod.
 */
export function changeDayPlannedDate(
  { day, schedule }: DayWithSchedule,
  plannedDate: LocalDate | null,
): DayWithSchedule {
  const changedDay = day.plannedDate === plannedDate ? day : { ...day, plannedDate };

  if (plannedDate === null || schedule === null) {
    return { day: changedDay, schedule: null };
  }
  if (getScheduleLocalDate(schedule) === plannedDate) {
    return { day: changedDay, schedule };
  }

  const startMs = Date.parse(schedule.startAt);
  const durationMs = Date.parse(schedule.endAt) - startMs;
  const localStart = getZonedDateTimeParts(startMs, schedule.timezone);
  const movedStartMs = zonedDateTimeToInstant(
    { ...localStart, ...parseLocalDate(plannedDate) },
    schedule.timezone,
  );

  return {
    day: changedDay,
    schedule: {
      ...schedule,
      startAt: formatOffsetDateTime(movedStartMs, schedule.timezone),
      endAt: formatOffsetDateTime(movedStartMs + durationMs, schedule.timezone),
    },
  };
}

/** Removes only the placement; the Day, including its plannedDate, is kept unchanged. */
export function removeDaySchedule({ day }: DayWithSchedule): DayWithSchedule {
  return { day, schedule: null };
}
