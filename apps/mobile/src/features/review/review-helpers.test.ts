import type { ReviewResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { goalFixture } from "../../test-fixtures";
import {
  addItemChange,
  linkItemChange,
  nextGoalCandidates,
  removeItemChange,
  reviewGoalCandidates,
  reviewPeriod,
  saveReviewRequest,
  shiftAnchor,
} from "./review-helpers";

const review: ReviewResponse = {
  id: "r",
  type: "WEEK",
  periodStart: "2026-09-14",
  periodEnd: "2026-09-20",
  rating: 4,
  completed: false,
  items: [
    { id: "i1", kind: "KEEP", content: "아침 개발", goalId: "w1", targetGoalId: null, convertedDayId: null },
    { id: "i2", kind: "TRY", content: "설계 먼저", goalId: null, targetGoalId: "w2", convertedDayId: "d9" },
  ],
  createdAt: "",
  updatedAt: "",
  version: 3,
};

describe("Review periods", () => {
  it("computes each period and moves between them", () => {
    expect(reviewPeriod("WEEK", "2026-09-16")).toMatchObject({ start: "2026-09-14", end: "2026-09-20" });
    expect(reviewPeriod("MONTH", "2026-02-10")).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
    expect(reviewPeriod("QUARTER", "2026-09-16")).toMatchObject({ start: "2026-07-01", end: "2026-09-30", label: "2026 3분기" });
    expect(shiftAnchor("MONTH", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("QUARTER", "2026-09-16", -1)).toBe("2026-06-01");
    expect(shiftAnchor("WEEK", "2026-09-16", 1)).toBe("2026-09-23");
  });

  it("offers period Goals for links and later Goals for Try carry-over", () => {
    const period = reviewPeriod("WEEK", "2026-09-16");
    const goals = [
      goalFixture({ id: "w1", type: "WEEK", startDate: "2026-09-14", endDate: "2026-09-20" }),
      goalFixture({ id: "w2", type: "WEEK", startDate: "2026-09-21", endDate: "2026-09-27" }),
      goalFixture({ id: "m", type: "MONTH", startDate: "2026-09-01", endDate: "2026-09-30" }),
    ];
    expect(reviewGoalCandidates(goals, period).map((goal) => goal.id)).toEqual(["w1"]);
    expect(nextGoalCandidates(goals, period).map((goal) => goal.id)).toEqual(["w2"]);
  });
});

describe("Review save requests", () => {
  it("adds, removes and relinks lines while keeping the other fields and version", () => {
    expect(saveReviewRequest(null, addItemChange(null, "KEEP", " 좋았음 ", null))).toEqual({
      rating: null,
      completed: false,
      items: [{ id: null, kind: "KEEP", content: "좋았음", goalId: null, targetGoalId: null }],
      expectedVersion: null,
    });
    expect(saveReviewRequest(review, removeItemChange(review, "i1"))).toMatchObject({ rating: 4, expectedVersion: 3, items: [{ id: "i2", targetGoalId: "w2" }] });
    expect(saveReviewRequest(review, linkItemChange(review, "i2", { targetGoalId: null })).items[1]).toEqual({
      id: "i2",
      kind: "TRY",
      content: "설계 먼저",
      goalId: null,
      targetGoalId: null,
    });
    expect(saveReviewRequest(review, { completed: true, rating: null })).toMatchObject({ completed: true, rating: null });
  });
});