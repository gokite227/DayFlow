export const GOAL_TYPES = ["YEAR", "QUARTER", "MONTH", "WEEK"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const PROGRESS_POLICIES = ["AUTO", "MANUAL"] as const;
export type ProgressPolicy = (typeof PROGRESS_POLICIES)[number];

export const DAY_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "DONE",
  "DEFERRED",
  "SKIPPED",
] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

export const DAY_PLANNING_MODES = ["FIXED", "WINDOW", "ANYTIME"] as const;
export type DayPlanningMode = (typeof DAY_PLANNING_MODES)[number];

/** A calendar date without a time or timezone, serialized as YYYY-MM-DD. */
export type LocalDate = string;

/** An ISO-8601 instant containing Z or an explicit UTC offset. */
export type OffsetDateTime = string;

export type EntityId = string;

export interface VersionedEntity {
  createdAt: OffsetDateTime;
  updatedAt: OffsetDateTime;
  version: number;
}

export interface Goal extends VersionedEntity {
  id: EntityId;
  parentGoalId: EntityId | null;
  type: GoalType;
  title: string;
  why: string;
  startDate: LocalDate;
  endDate: LocalDate;
  priority: number;
  progressPolicy: ProgressPolicy;
}

export type CreateGoalInput = Omit<Goal, keyof VersionedEntity | "id">;

type GoalMutableFields = Pick<
  Goal,
  | "parentGoalId"
  | "title"
  | "why"
  | "startDate"
  | "endDate"
  | "priority"
  | "progressPolicy"
>;

export type UpdateGoalInput = {
  [Key in keyof GoalMutableFields]?: GoalMutableFields[Key] | undefined;
} & { version: number };

export interface Day extends VersionedEntity {
  id: EntityId;
  goalId: EntityId;
  title: string;
  status: DayStatus;
  priority: number;
  estimatedMinutes: number;
  plannedDate: LocalDate | null;
  planningMode: DayPlanningMode;
  coreDay: boolean;
}

export type CreateDayInput = Omit<Day, keyof VersionedEntity | "id">;

type DayMutableFields = Pick<
  Day,
  | "goalId"
  | "title"
  | "status"
  | "priority"
  | "estimatedMinutes"
  | "plannedDate"
  | "planningMode"
  | "coreDay"
>;

export type UpdateDayInput = {
  [Key in keyof DayMutableFields]?: DayMutableFields[Key] | undefined;
} & { version: number };

/**
 * A Day's optional time placement. Its lifecycle is deliberately separate from
 * Day: removing this entity only unschedules the Day.
 */
export interface DaySchedule extends VersionedEntity {
  id: EntityId;
  dayId: EntityId;
  startAt: OffsetDateTime;
  endAt: OffsetDateTime;
  /** IANA timezone. The schedule's calendar date is resolved in this timezone. */
  timezone: string;
}

/**
 * Request body of PUT /api/v1/days/{dayId}/schedule. dayId comes from the path;
 * id and audit fields are assigned by the server.
 */
export type SetDayScheduleInput = Pick<DaySchedule, "startAt" | "endAt" | "timezone"> & {
  /** null when creating a schedule; the current schedule version when replacing it. */
  expectedVersion: number | null;
};

/** A Day has at most one schedule (0..1), so it is a nullable value, never a list. */
export interface DayWithSchedule {
  day: Day;
  schedule: DaySchedule | null;
}
