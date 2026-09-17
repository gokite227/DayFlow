import type { CalendarGoalResponse, DayResponse, GoalResponse, PeriodGoalResponse } from "@dayflow/api-client";
import { groupDaysByWeek } from "@dayflow/domain";
import { describe, expect, it } from "vitest";
import { dropTargetDate, planDrop } from "../calendar/calendar-drop";
import { PERIOD_CARRY_OVER_BLOCKED, moveRange, recoveryActionBlockedReason } from "../recovery/recovery-plan";
import { goalChipLabel, reviewGoalCandidates, reviewPeriodGoalCandidates } from "../review/review-goals";
import { reviewPeriod } from "../review/review-period";
import { goalDetailHref } from "./goal-views";
import {
  PERIOD_FORM_ISSUE_MESSAGE,
  dayDateProblem,
  dayGoalLink,
  defaultDayDate,
  filterPeriodGoals,
  periodCountLabel,
  periodGoalCalendarHref,
  periodGoalFormIssue,
  periodGoalOptionLabel,
  periodProgressLabel,
  selectablePeriodGoals,
  summarizePeriodGoal,
  toCreatePeriodGoalRequest,
  toUpdatePeriodGoalRequest,
} from "./period-goal-values";

const today = "2026-09-25";

const periodGoal = (id: string, startDate: string, endDate: string, title = id): PeriodGoalResponse => ({
  id,
  kind: "PERIOD",
  type: null,
  parentGoalId: null,
  title,
  why: "",
  startDate,
  endDate,
  priority: 1,
  progressPolicy: "AUTO",
  continuedFromGoalId: null,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 2,
});

const weekGoal = (id: string, startDate: string, endDate: string): CalendarGoalResponse => ({
  ...periodGoal(id, startDate, endDate),
  kind: "CALENDAR",
  type: "WEEK",
  title: `${id} week`,
});

const day = (id: string, goalId: string | null, plannedDate: string | null, status: DayResponse["status"] = "NOT_STARTED"): DayResponse => ({
  id,
  goalId,
  title: id,
  status,
  priority: "NONE",
  tags: [],
  estimatedMinutes: 30,
  plannedDate,
  planningMode: "ANYTIME",
  carriedFromDayId: null,
  coreDay: false,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 0,
  schedule: null,
});

const exam = periodGoal("exam", "2026-09-21", "2026-10-08", "중간고사 준비");
const trip = periodGoal("trip", "2026-10-10", "2026-10-15", "일본 여행 준비");
const portfolio = periodGoal("portfolio", "2026-08-01", "2026-09-10", "포트폴리오 완성");

describe("PERIOD Goal list", () => {
  it("shows 진행 중 → 예정 → 종료 and filters by the derived status", () => {
    const goals = [portfolio, trip, exam];
    expect(filterPeriodGoals(goals, "all", today).map((goal) => goal.id)).toEqual(["exam", "trip", "portfolio"]);
    expect(filterPeriodGoals(goals, "ACTIVE", today).map((goal) => goal.id)).toEqual(["exam"]);
    expect(filterPeriodGoals(goals, "UPCOMING", today).map((goal) => goal.id)).toEqual(["trip"]);
    expect(filterPeriodGoals(goals, "ENDED", today).map((goal) => goal.id)).toEqual(["portfolio"]);
  });

  it("computes progress from the directly linked Days; no Days is 0%", () => {
    const days = [
      day("a", "exam", "2026-09-21", "DONE"),
      day("b", "exam", null),
      day("c", "exam", "2026-09-30", "SKIPPED"),
      day("d", "trip", "2026-10-11", "DONE"),
      day("e", null, "2026-09-22", "DONE"),
    ];
    const summary = summarizePeriodGoal(days, "exam");
    expect(periodProgressLabel(summary)).toBe("50%");
    expect(periodCountLabel(summary)).toBe("완료 1 / 2");
    expect(periodProgressLabel(summarizePeriodGoal(days, "portfolio"))).toBe("0%");
  });
});

describe("PERIOD Goal create / edit", () => {
  it("creates a PERIOD Goal without level or parent", () => {
    const values = { title: "  중간고사 준비 ", startDate: "2026-09-21", endDate: "2026-10-08" };
    expect(periodGoalFormIssue(values)).toBeNull();
    expect(toCreatePeriodGoalRequest(values)).toEqual({
      kind: "PERIOD",
      type: null,
      parentGoalId: null,
      title: "중간고사 준비",
      why: "",
      startDate: "2026-09-21",
      endDate: "2026-10-08",
      priority: 1,
      progressPolicy: "AUTO",
    });
  });

  it("refuses an end date before the start date on the client", () => {
    const issue = periodGoalFormIssue({ title: "여행", startDate: "2026-10-15", endDate: "2026-10-10" });
    expect(issue).toBe("range");
    expect(PERIOD_FORM_ISSUE_MESSAGE[issue!]).toContain("종료일");
  });

  it("edits only title and dates with the seen version (the parent is not sent)", () => {
    expect(toUpdatePeriodGoalRequest({ title: "기말 준비", startDate: "2026-09-21", endDate: "2026-10-09" }, exam.version)).toEqual({
      title: "기말 준비",
      startDate: "2026-09-21",
      endDate: "2026-10-09",
      version: 2,
    });
  });

  it("opens the Calendar at the first day of the period", () => {
    expect(periodGoalCalendarHref(exam)).toBe("/calendar?date=2026-09-21");
  });
});

describe("PERIOD Goal detail Days", () => {
  it("groups linked Days by week inside the range, undated last", () => {
    const groups = groupDaysByWeek([day("x", "exam", "2026-10-02"), day("y", "exam", null), day("z", "exam", "2026-09-22")], exam);
    expect(groups.map((group) => [group.range, group.days.map((entry) => entry.id)])).toEqual([
      [{ startDate: "2026-09-21", endDate: "2026-09-27" }, ["z"]],
      [{ startDate: "2026-09-28", endDate: "2026-10-04" }, ["x"]],
      [null, ["y"]],
    ]);
  });

  it("starts a new Day today while the Goal runs, otherwise on its first day", () => {
    expect(defaultDayDate(exam, today)).toBe(today);
    expect(defaultDayDate(trip, today)).toBe("2026-10-10");
  });
});

describe("Day ↔ Goal selector and dates", () => {
  it("offers running and upcoming PERIOD Goals, and an ended one only when already linked", () => {
    expect(selectablePeriodGoals([portfolio, trip, exam], today, "").map((goal) => goal.id)).toEqual(["exam", "trip"]);
    expect(selectablePeriodGoals([portfolio, trip, exam], today, "portfolio").map((goal) => goal.id)).toEqual([
      "exam",
      "trip",
      "portfolio",
    ]);
    expect(periodGoalOptionLabel(portfolio, today)).toBe("포트폴리오 완성 · 8/1 ~ 9/10 · 종료");
  });

  it("allows no date and dates inside the period, and explains dates outside it", () => {
    expect(dayDateProblem(exam, null)).toBeNull();
    expect(dayDateProblem(exam, "")).toBeNull();
    expect(dayDateProblem(exam, "2026-09-21")).toBeNull();
    expect(dayDateProblem(exam, "2026-10-08")).toBeNull();
    expect(dayDateProblem(exam, "2026-09-20")).toContain("기간 목표");
    expect(dayDateProblem(exam, "2026-10-09")).toContain("9/21 ~ 10/8");
    expect(dayDateProblem(undefined, "2030-01-01")).toBeNull();
  });

  it("keeps the CALENDAR WEEK rule and message", () => {
    const week = weekGoal("w", "2026-09-21", "2026-09-27");
    expect(dayDateProblem(week, "2026-09-27")).toBeNull();
    expect(dayDateProblem(week, "2026-09-28")).toContain("주간 목표");
  });

  it("links a Day row to its Goal detail and marks PERIOD Goals", () => {
    const goalsById = new Map<string, GoalResponse>([
      [exam.id, exam],
      ["w", weekGoal("w", "2026-09-21", "2026-09-27")],
    ]);
    expect(dayGoalLink(day("a", "exam", null), goalsById)).toEqual({ href: "/goals/exam", label: "기간 · 중간고사 준비" });
    expect(dayGoalLink(day("b", "w", null), goalsById)).toEqual({ href: "/goals/w", label: "w week" });
    expect(dayGoalLink(day("c", null, null), goalsById)).toBeUndefined();
    // The same detail route serves both kinds, so existing detail links keep working.
    expect(goalDetailHref("exam")).toBe("/goals/exam");
  });
});

describe("Calendar drop into a PERIOD Goal Day", () => {
  it("refuses a drop outside the period before any request, so nothing moves", () => {
    const linked = day("a", "exam", "2026-10-07");
    const outside = planDrop(linked, { kind: "date", date: "2026-10-09" }, 0, 48);
    expect(outside).toEqual({ type: "moveDate", date: "2026-10-09" });
    expect(dayDateProblem(exam, dropTargetDate(outside!) ?? null)).not.toBeNull();

    const inside = planDrop(linked, { kind: "time", date: "2026-10-08" }, 480, 48);
    expect(dropTargetDate(inside!)).toBe("2026-10-08");
    expect(dayDateProblem(exam, dropTargetDate(inside!) ?? null)).toBeNull();

    // Moving to 미배치 clears the date and is always allowed.
    const unscheduled = planDrop(linked, { kind: "unscheduled" }, 0, 48);
    expect(dayDateProblem(exam, dropTargetDate(unscheduled!) ?? null)).toBeNull();
  });
});

describe("Review with PERIOD Goals", () => {
  it("offers PERIOD Goals overlapping the reviewed period next to the CALENDAR level Goals", () => {
    const period = reviewPeriod("WEEK", "2026-09-16"); // 9/14 ~ 9/20
    const touching = periodGoal("touching", "2026-09-20", "2026-09-30");
    const before = periodGoal("before", "2026-09-01", "2026-09-13");
    const covering = periodGoal("covering", "2026-09-01", "2026-09-30");
    expect(reviewPeriodGoalCandidates([exam, touching, portfolio, before, covering], period).map((goal) => goal.id)).toEqual([
      "covering",
      "touching",
    ]);
    // CALENDAR candidates are unchanged and never include PERIOD Goals.
    expect(reviewGoalCandidates([weekGoal("w3", "2026-09-14", "2026-09-20")], period).map((goal) => goal.id)).toEqual(["w3"]);
    expect(goalChipLabel(exam)).toBe("기간 · 중간고사 준비 (9/21 ~ 10/8)");
  });
});

describe("Recovery with PERIOD Goals", () => {
  it("moves only inside the period and hides Carry Over", () => {
    const linked = day("a", "exam", "2026-09-22");
    const range = moveRange(exam, today);
    expect(range).toEqual({ min: today, max: "2026-10-08" });
    expect(recoveryActionBlockedReason("MOVE", linked, exam, range)).toBeNull();
    expect(recoveryActionBlockedReason("CARRY_OVER", linked, exam, range)).toBe(PERIOD_CARRY_OVER_BLOCKED);

    const ended = moveRange(portfolio, today);
    expect(ended).toBeNull();
    expect(recoveryActionBlockedReason("MOVE", day("b", "portfolio", "2026-09-01"), portfolio, ended)).toContain("기간 목표");
  });

  it("keeps CALENDAR Carry Over and Goal-less rules", () => {
    const week = weekGoal("w", "2026-09-14", "2026-09-20");
    expect(recoveryActionBlockedReason("CARRY_OVER", day("a", "w", "2026-09-15"), week, null)).toBeNull();
    expect(recoveryActionBlockedReason("MOVE", day("a", "w", "2026-09-15"), week, null)).toContain("이 주가 지나서");
    expect(recoveryActionBlockedReason("CARRY_OVER", day("b", null, "2026-09-15"), undefined, { min: today, max: null })).toContain(
      "목표 없는 Day",
    );
  });
});
