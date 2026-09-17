import type {
  CalendarGoalResponse as GoalResponse,
  GoalResponse as AnyGoalResponse,
  PeriodGoalResponse,
  ReviewItemRequest,
  ReviewItemResponse,
} from "@dayflow/api-client";
import { goalPeriodLabel, periodRangeLabel } from "../goals/goal-period";
import { sortGoals } from "../goals/goal-tree";
import { REVIEW_GOAL_TYPE, overlaps, type ReviewPeriod } from "./review-period";

/**
 * PERIOD Goals a review can reflect on: every PERIOD Goal whose range overlaps the reviewed period
 * (start <= review end and end >= review start), whatever the review level. The server checks the same rule.
 * They are never offered as a Try's next Goal (targetGoalId stays CALENDAR only).
 */
export function reviewPeriodGoalCandidates(goals: readonly PeriodGoalResponse[], period: ReviewPeriod): PeriodGoalResponse[] {
  return goals
    .filter((goal) => overlaps(goal, period))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

/**
 * REV-003 candidates for "which Goal does this line reflect on": the same Goals the review's Goals
 * card shows (the review's Goal level, overlapping the period). The server checks the same rule.
 */
export function reviewGoalCandidates(goals: readonly GoalResponse[], period: ReviewPeriod): GoalResponse[] {
  return sortGoals(goals.filter((goal) => goal.type === REVIEW_GOAL_TYPE[period.type] && overlaps(goal, period)));
}

/**
 * REV-004 candidates for "carry this Try into": Goals of the same level that continue after the
 * reviewed period (next week for a weekly review, next month for a monthly one, …), nearest first.
 * A daily review may pick the current WEEK Goal because the week goes on after that day.
 */
export function nextGoalCandidates(goals: readonly GoalResponse[], period: ReviewPeriod): GoalResponse[] {
  return goals
    .filter((goal) => goal.type === REVIEW_GOAL_TYPE[period.type] && goal.endDate > period.end)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

/** "9월 3주 · 백엔드 준비" — compact enough for a chip, with the period to tell same-named Goals apart. */
export function goalChipLabel(goal: AnyGoalResponse, withYear = false): string {
  if (goal.kind === "PERIOD") return `기간 · ${goal.title} (${periodRangeLabel(goal)})`;
  return `${goalPeriodLabel(goal, withYear)} · ${goal.title}`;
}

/**
 * REV-004 Try → Day Goal choices: only WEEK Goals, and once a date is picked only the ones containing
 * it, so the form cannot send a Goal the server would reject (DATE_OUTSIDE_WEEK_GOAL_PERIOD).
 */
export function dayGoalCandidates(weekGoals: readonly GoalResponse[], plannedDate: string): GoalResponse[] {
  const week = weekGoals.filter((goal) => goal.type === "WEEK");
  return plannedDate === ""
    ? sortGoals(week)
    : sortGoals(week.filter((goal) => goal.startDate <= plannedDate && plannedDate <= goal.endDate));
}

/** A suggestion only when exactly one WEEK Goal contains the date; the user can still pick "연결 안 함". */
export function suggestedDayGoalId(weekGoals: readonly GoalResponse[], plannedDate: string): string {
  if (plannedDate === "") return "";
  const candidates = dayGoalCandidates(weekGoals, plannedDate);
  return candidates.length === 1 ? candidates[0]!.id : "";
}

/** The saved line as a request, keeping both Goal links (PUT replaces the whole list). */
export function toItemRequest(item: ReviewItemResponse): ReviewItemRequest {
  return {
    id: item.id,
    kind: item.kind,
    content: item.content,
    goalId: item.goalId,
    targetGoalId: item.kind === "TRY" ? item.targetGoalId : null,
  };
}
