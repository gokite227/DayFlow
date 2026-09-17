import type { CalendarGoalResponse as GoalResponse, ReviewItemResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import {
  dayGoalCandidates,
  goalChipLabel,
  nextGoalCandidates,
  reviewGoalCandidates,
  suggestedDayGoalId,
  toItemRequest,
} from "./review-goals";
import { reviewPeriod } from "./review-period";

const goal = (id: string, type: GoalResponse["type"], startDate: string, endDate: string, title = id): GoalResponse => ({
  id,
  kind: "CALENDAR",
  type,
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
  version: 0,
});

const september = goal("sep", "MONTH", "2026-09-01", "2026-09-30", "콘텐츠 운영");
const october = goal("oct", "MONTH", "2026-10-01", "2026-10-31", "콘텐츠 운영");
const august = goal("aug", "MONTH", "2026-08-01", "2026-08-31");
const week2 = goal("w2", "WEEK", "2026-09-07", "2026-09-13");
const week3 = goal("w3", "WEEK", "2026-09-14", "2026-09-20", "백엔드 준비");
const week4 = goal("w4", "WEEK", "2026-09-21", "2026-09-27");
const week4b = goal("w4b", "WEEK", "2026-09-21", "2026-09-27");
const goals = [september, october, august, week2, week3, week4, week4b];

describe("REV-003 KPT Goal candidates", () => {
  it("uses the review's Goal level and period", () => {
    expect(reviewGoalCandidates(goals, reviewPeriod("WEEK", "2026-09-16")).map((entry) => entry.id)).toEqual(["w3"]);
    expect(reviewGoalCandidates(goals, reviewPeriod("DAY", "2026-09-16")).map((entry) => entry.id)).toEqual(["w3"]);
    expect(reviewGoalCandidates(goals, reviewPeriod("MONTH", "2026-09-16")).map((entry) => entry.id)).toEqual(["sep"]);
  });

  it("labels a Goal with its period", () => {
    expect(goalChipLabel(week3)).toBe("9월 3주 · 백엔드 준비");
    expect(goalChipLabel(october)).toBe("10월 · 콘텐츠 운영");
  });
});

describe("REV-004 next Goal candidates", () => {
  it("offers later Goals of the same level, nearest first", () => {
    expect(nextGoalCandidates(goals, reviewPeriod("WEEK", "2026-09-16")).map((entry) => entry.id)).toEqual(["w4", "w4b"]);
    expect(nextGoalCandidates(goals, reviewPeriod("MONTH", "2026-09-16")).map((entry) => entry.id)).toEqual(["oct"]);
    // A day review can still carry a Try into the week that goes on.
    expect(nextGoalCandidates(goals, reviewPeriod("DAY", "2026-09-16")).map((entry) => entry.id)).toEqual([
      "w3",
      "w4",
      "w4b",
    ]);
    expect(nextGoalCandidates(goals, reviewPeriod("YEAR", "2026-09-16"))).toEqual([]);
  });
});

describe("REV-004 Try → Day Goal choices", () => {
  it("limits WEEK Goals to the chosen date and suggests only a single match", () => {
    expect(dayGoalCandidates(goals, "").map((entry) => entry.id)).toEqual(["w2", "w3", "w4", "w4b"]);
    expect(dayGoalCandidates(goals, "2026-09-18").map((entry) => entry.id)).toEqual(["w3"]);
    expect(suggestedDayGoalId(goals, "2026-09-18")).toBe("w3");
    expect(suggestedDayGoalId(goals, "2026-09-22")).toBe("");
    expect(suggestedDayGoalId(goals, "")).toBe("");
    expect(dayGoalCandidates(goals, "2026-11-02")).toEqual([]);
  });
});

describe("REV-003 item requests", () => {
  it("keeps both Goal links and never sends a next Goal for non-TRY lines", () => {
    const item: ReviewItemResponse = {
      id: "i",
      kind: "TRY",
      content: "주 2회로 줄이기",
      convertedDayId: "day",
      goalId: "sep",
      targetGoalId: "oct",
    };
    expect(toItemRequest(item)).toEqual({ id: "i", kind: "TRY", content: "주 2회로 줄이기", goalId: "sep", targetGoalId: "oct" });
    expect(toItemRequest({ ...item, kind: "KEEP" }).targetGoalId).toBeNull();
  });
});
