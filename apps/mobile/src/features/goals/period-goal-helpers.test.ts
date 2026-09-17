import type { PeriodGoalResponse } from "@dayflow/api-client";
import { daysOutsideRange, groupDaysByWeek, periodGoalFormIssue } from "@dayflow/domain";
import { describe, expect, it } from "vitest";
import { dayFixture, goalFixture } from "../../test-fixtures";
import { dropDateProblem, planDrop } from "../calendar/calendar-grid";
import { dayGoalLine } from "../days/day-values";
import { OPEN_SCREEN_PARAM, RESERVED_NAVIGATION_PARAMS, screenLink } from "../navigation/app-routes";
import { PERIOD_CARRY_OVER_BLOCKED, actionUnavailableReason, moveRange } from "../recovery/recovery-helpers";
import { reviewGoalCandidates, reviewPeriod, reviewPeriodGoalCandidates } from "../review/review-helpers";
import { goalChipLabel } from "./goal-helpers";
import {
  dayDateProblem,
  defaultDayDate,
  filterPeriodGoals,
  periodCountLabel,
  periodGoalCalendarParams,
  periodGoalOptionLabel,
  periodProgressLabel,
  selectablePeriodGoals,
  summarizePeriodGoal,
  toCreatePeriodGoalRequest,
  toUpdatePeriodGoalRequest,
} from "./period-goal-helpers";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const today = "2026-09-25";
const period = (id: string, startDate: string, endDate: string, title = id) =>
  goalFixture({ id, kind: "PERIOD", type: null, parentGoalId: null, title, startDate, endDate, version: 2 }) as PeriodGoalResponse;

const exam = period("exam", "2026-09-21", "2026-10-08", "중간고사 준비");
const trip = period("trip", "2026-10-10", "2026-10-15", "일본 여행 준비");
const portfolio = period("portfolio", "2026-08-01", "2026-09-10", "포트폴리오 완성");
const week = goalFixture({ id: "w", type: "WEEK", title: "백엔드", startDate: "2026-09-21", endDate: "2026-09-27" });
const month = goalFixture({ id: "m", type: "MONTH", title: "9월", startDate: "2026-09-01", endDate: "2026-09-30" });

describe("PERIOD Goal list (mobile)", () => {
  it("lists 진행 중 → 예정 → 종료 and filters by the derived status", () => {
    expect(filterPeriodGoals([portfolio, trip, exam], "all", today).map((goal) => goal.id)).toEqual(["exam", "trip", "portfolio"]);
    expect(filterPeriodGoals([portfolio, trip, exam], "UPCOMING", today).map((goal) => goal.id)).toEqual(["trip"]);
  });

  it("shows progress of the directly linked Days, 0% without Days", () => {
    const days = [
      dayFixture({ id: "a", goalId: "exam", status: "DONE" }),
      dayFixture({ id: "b", goalId: "exam" }),
      dayFixture({ id: "c", goalId: "trip", status: "DONE" }),
    ];
    const summary = summarizePeriodGoal(days, "exam");
    expect(periodProgressLabel(summary)).toBe("50%");
    expect(periodCountLabel(summary)).toBe("완료 1 / 2");
    expect(periodProgressLabel(summarizePeriodGoal(days, "portfolio"))).toBe("0%");
  });
});

describe("PERIOD Goal create / edit / delete (mobile)", () => {
  it("creates without level or parent and edits only title and dates", () => {
    expect(toCreatePeriodGoalRequest({ title: " 여행 ", startDate: "2026-10-10", endDate: "2026-10-15" })).toMatchObject({
      kind: "PERIOD",
      type: null,
      parentGoalId: null,
      title: "여행",
    });
    expect(toUpdatePeriodGoalRequest({ title: "여행", startDate: "2026-10-10", endDate: "2026-10-16" }, 2)).toEqual({
      title: "여행",
      startDate: "2026-10-10",
      endDate: "2026-10-16",
      version: 2,
    });
    expect(periodGoalFormIssue({ title: "여행", startDate: "2026-10-16", endDate: "2026-10-10" })).toBe("range");
  });

  it("detects linked Days a shorter range would leave outside (the edit is refused, nothing moves)", () => {
    const days = [dayFixture({ id: "late", goalId: "exam", plannedDate: "2026-10-08" }), dayFixture({ id: "undated", goalId: "exam" })];
    expect(daysOutsideRange(days, { startDate: "2026-09-21", endDate: "2026-10-07" }).map((day) => day.id)).toEqual(["late"]);
  });

  it("has a route for the create/edit modal and the shared Goal detail", () => {
    const routes = Object.keys(import.meta.glob("../../../app/**/*.tsx")).map((file) => file.replace("../../../app/", ""));
    expect(routes).toContain("goals/period-edit.tsx");
    expect(routes).toContain("goals/[goalId].tsx");
  });
});

describe("PERIOD Goal detail (mobile)", () => {
  it("groups Days by week inside the period, undated last", () => {
    const groups = groupDaysByWeek(
      [dayFixture({ id: "x", plannedDate: "2026-10-02" }), dayFixture({ id: "u" }), dayFixture({ id: "z", plannedDate: "2026-09-22" })],
      exam,
    );
    expect(groups.map((group) => group.days.map((day) => day.id))).toEqual([["z"], ["x"], ["u"]]);
  });

  it("opens the Calendar at the first day as a stacked screen when Calendar is not a tab", () => {
    const params = periodGoalCalendarParams(exam);
    expect(params).toEqual({ date: "2026-09-21", view: "week" });
    const link = screenLink("calendar", ["today", "goals", "review", "recovery"], params);
    expect(link).toEqual({ method: "push", href: { pathname: "/open/[feature]", params: { date: "2026-09-21", view: "week", [OPEN_SCREEN_PARAM]: "calendar" } } });
    for (const key of Object.keys(link.href.params ?? {})) expect(RESERVED_NAVIGATION_PARAMS).not.toContain(key);
  });

  it("starts a new Day today while the Goal runs, otherwise on its first day", () => {
    expect(defaultDayDate(exam, today)).toBe(today);
    expect(defaultDayDate(trip, today)).toBe("2026-10-10");
  });
});

describe("Day ↔ Goal selector (mobile)", () => {
  it("offers running and upcoming PERIOD Goals and keeps an ended linked one", () => {
    expect(selectablePeriodGoals([portfolio, trip, exam], today, "").map((goal) => goal.id)).toEqual(["exam", "trip"]);
    expect(selectablePeriodGoals([portfolio, trip, exam], today, "portfolio").map((goal) => goal.id)).toContain("portfolio");
    expect(periodGoalOptionLabel(portfolio, today)).toContain("종료");
  });

  it("validates dates against the linked PERIOD Goal and keeps the WEEK rule", () => {
    expect(dayDateProblem(exam, "")).toBeNull();
    expect(dayDateProblem(exam, "2026-10-08")).toBeNull();
    expect(dayDateProblem(exam, "2026-09-20")).toContain("기간 목표");
    expect(dayDateProblem(week, "2026-09-28")).toContain("주간 목표");
  });

  it("marks PERIOD Goals on Day rows", () => {
    const goalsById = new Map([
      [exam.id, exam],
      [week.id, week],
    ]);
    expect(dayGoalLine(dayFixture({ goalId: "exam" }), goalsById)).toBe("기간 · 중간고사 준비");
    expect(dayGoalLine(dayFixture({ goalId: "w" }), goalsById)).toBe("9월 4주 · 백엔드");
    expect(goalChipLabel(exam)).toBe("기간 · 중간고사 준비 (9/21 ~ 10/8)");
  });
});

describe("Calendar, Review, Recovery with PERIOD Goals (mobile)", () => {
  it("refuses a Calendar drop outside the period before the optimistic update", () => {
    const day = dayFixture({ goalId: "exam", plannedDate: "2026-10-07" });
    const outside = planDrop(day, { kind: "date", date: "2026-10-09" }, 0);
    expect(outside).not.toBeNull();
    expect(dropDateProblem(exam, outside!)).toContain("기간 목표");
    const inside = planDrop(day, { kind: "date", date: "2026-10-08" }, 0);
    expect(dropDateProblem(exam, inside!)).toBeNull();
  });

  it("adds overlapping PERIOD Goals to the review context without changing CALENDAR candidates", () => {
    const weekReview = reviewPeriod("WEEK", "2026-09-23"); // 9/21 ~ 9/27
    expect(reviewPeriodGoalCandidates([exam, trip, portfolio, week], weekReview).map((goal) => goal.id)).toEqual(["exam"]);
    expect(reviewGoalCandidates([exam, week, month], weekReview).map((goal) => goal.id)).toEqual(["w"]);
  });

  it("moves only inside the period and disables Carry Over for PERIOD Goal Days", () => {
    const day = dayFixture({ goalId: "exam", plannedDate: "2026-09-22" });
    const range = moveRange(exam, today);
    expect(range).toEqual({ min: today, max: "2026-10-08" });
    expect(actionUnavailableReason("MOVE", day, range, exam)).toBeNull();
    expect(actionUnavailableReason("CARRY_OVER", day, range, exam)).toBe(PERIOD_CARRY_OVER_BLOCKED);
    expect(actionUnavailableReason("CARRY_OVER", dayFixture({ goalId: "w" }), null, week)).toBeNull();
    expect(actionUnavailableReason("MOVE", dayFixture({ goalId: "portfolio" }), moveRange(portfolio, today), portfolio)).toContain("기간 목표");
  });
});
