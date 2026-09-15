import {
  DAY_PLANNING_MODES,
  DAY_STATUSES,
  validateDayGoal,
  validateDayInWeekGoalPeriod,
  type CreateDayInput,
  type Day,
  type DomainIssue,
  type Goal,
  type UpdateDayInput,
} from "@dayflow/domain";
import { z } from "zod";
import {
  addDomainIssues,
  entityIdSchema,
  localDateSchema,
  prioritySchema,
  titleSchema,
  versionSchema,
} from "./common";

const dayFields = {
  goalId: entityIdSchema,
  title: titleSchema,
  status: z.enum(DAY_STATUSES),
  priority: prioritySchema,
  estimatedMinutes: z.int().positive(),
  plannedDate: localDateSchema.nullable(),
  planningMode: z.enum(DAY_PLANNING_MODES),
  coreDay: z.boolean(),
};

export const createDaySchema = z.strictObject(dayFields) satisfies z.ZodType<CreateDayInput>;

const mutableDayFields = Object.fromEntries(
  Object.entries(dayFields).map(([key, schema]) => [key, schema.optional()]),
) as { [Key in keyof typeof dayFields]: z.ZodOptional<(typeof dayFields)[Key]> };

export const updateDaySchema = z
  .strictObject({ ...mutableDayFields, version: versionSchema })
  .refine((input) => Object.keys(input).some((key) => key !== "version"), {
    message: "At least one Day field must be provided.",
  }) satisfies z.ZodType<UpdateDayInput>;

/** The date range is checked only once the Day belongs to a valid WEEK Goal. */
function validateDayInGoal(
  day: Pick<Day, "goalId" | "plannedDate">,
  goal: Goal,
): DomainIssue[] {
  const goalIssues = validateDayGoal(day, goal);
  return goalIssues.length > 0 ? goalIssues : validateDayInWeekGoalPeriod(day, goal);
}

export function createDaySchemaForGoal(goal: Goal) {
  return createDaySchema.superRefine((day, context) => {
    addDomainIssues(context, validateDayInGoal(day, goal));
  });
}

/**
 * Validates an update against the Day it changes. goal is the WEEK Goal the
 * Day belongs to after the update, so a kept plannedDate is checked against a
 * new goalId too.
 */
export function updateDaySchemaForCurrentDay(currentDay: Day, goal: Goal) {
  return updateDaySchema.superRefine((update, context) => {
    const definedUpdate = Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== undefined),
    ) as Partial<Day>;
    const candidate: Day = { ...currentDay, ...definedUpdate };
    addDomainIssues(context, validateDayInGoal(candidate, goal));
  });
}

export type CreateDaySchemaInput = z.input<typeof createDaySchema>;
export type UpdateDaySchemaInput = z.input<typeof updateDaySchema>;
