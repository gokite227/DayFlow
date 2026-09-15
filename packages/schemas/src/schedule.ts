import {
  validateDayScheduleRange,
  type DaySchedule,
  type SetDayScheduleInput,
} from "@dayflow/domain";
import { z } from "zod";
import {
  addDomainIssues,
  entityIdSchema,
  offsetDateTimeSchema,
  timezoneSchema,
  versionSchema,
} from "./common";

const scheduleTimeFields = {
  startAt: offsetDateTimeSchema,
  endAt: offsetDateTimeSchema,
  timezone: timezoneSchema,
};

/**
 * Body of PUT /api/v1/days/{dayId}/schedule. id, dayId and audit fields are not
 * accepted: dayId comes from the path and the rest is assigned by the server.
 * expectedVersion is required: null to create, the current version to replace.
 * The version conflict itself needs the stored schedule and is checked by
 * validateScheduleVersion.
 */
export const setDayScheduleSchema = z
  .strictObject({ ...scheduleTimeFields, expectedVersion: versionSchema.nullable() })
  .superRefine((schedule, context) => {
    addDomainIssues(context, validateDayScheduleRange(schedule));
  }) satisfies z.ZodType<SetDayScheduleInput>;

/** A stored DaySchedule entity, including its versioning fields. */
export const dayScheduleSchema = z
  .strictObject({
    id: entityIdSchema,
    dayId: entityIdSchema,
    ...scheduleTimeFields,
    createdAt: offsetDateTimeSchema,
    updatedAt: offsetDateTimeSchema,
    version: versionSchema,
  })
  .superRefine((schedule, context) => {
    addDomainIssues(context, validateDayScheduleRange(schedule));
  }) satisfies z.ZodType<DaySchedule>;

export type SetDayScheduleSchemaInput = z.input<typeof setDayScheduleSchema>;
export type DayScheduleSchemaInput = z.input<typeof dayScheduleSchema>;
