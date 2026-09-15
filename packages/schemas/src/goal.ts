import {
  GOAL_TYPES,
  PROGRESS_POLICIES,
  validateGoalCanonicalPeriod,
  validateGoalParent,
  validateGoalParentReference,
  validateGoalPeriod,
  type CreateGoalInput,
  type Goal,
  type GoalParentValidationOptions,
  type UpdateGoalInput,
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

const goalFields = {
  parentGoalId: entityIdSchema.nullable(),
  type: z.enum(GOAL_TYPES),
  title: titleSchema,
  why: z.string().trim().max(2000),
  startDate: localDateSchema,
  endDate: localDateSchema,
  priority: prioritySchema,
  progressPolicy: z.enum(PROGRESS_POLICIES),
};

/** Checks the rules that need no parent entity: period order, calendar period and parent reference. */
export const createGoalSchema = z
  .strictObject(goalFields)
  .superRefine((goal, context) => {
    addDomainIssues(context, [
      ...validateGoalPeriod(goal),
      ...validateGoalCanonicalPeriod(goal),
      ...validateGoalParentReference(goal),
    ]);
  }) satisfies z.ZodType<CreateGoalInput>;

const mutableGoalFields = {
  parentGoalId: goalFields.parentGoalId.optional(),
  title: goalFields.title.optional(),
  why: goalFields.why.optional(),
  startDate: goalFields.startDate.optional(),
  endDate: goalFields.endDate.optional(),
  priority: goalFields.priority.optional(),
  progressPolicy: goalFields.progressPolicy.optional(),
};

export const updateGoalSchema = z
  .strictObject({ ...mutableGoalFields, version: versionSchema })
  .refine((input) => Object.keys(input).some((key) => key !== "version"), {
    message: "At least one Goal field must be provided.",
  }) satisfies z.ZodType<UpdateGoalInput>;

/** createGoalSchema plus the rules that need the loaded parent Goal. */
export function createGoalSchemaForParent(
  parent: Goal | null,
  options: GoalParentValidationOptions = {},
) {
  return createGoalSchema.superRefine((goal, context) => {
    addDomainIssues(context, validateGoalParent(goal, parent, options));
  });
}

export function updateGoalSchemaForCurrentGoal(
  currentGoal: Goal,
  parent: Goal | null,
  options: GoalParentValidationOptions = {},
) {
  return updateGoalSchema.superRefine((update, context) => {
    const definedUpdate = Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== undefined),
    ) as Partial<Goal>;
    const candidate: Goal = { ...currentGoal, ...definedUpdate };
    addDomainIssues(context, [
      ...validateGoalPeriod(candidate),
      ...validateGoalCanonicalPeriod(candidate),
      ...validateGoalParentReference(candidate),
      ...validateGoalParent(candidate, parent, options),
    ]);
  });
}

export type CreateGoalSchemaInput = z.input<typeof createGoalSchema>;
export type UpdateGoalSchemaInput = z.input<typeof updateGoalSchema>;
