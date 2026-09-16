import type { CarryOverPreviewResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { dayFixture, goalFixture } from "../../test-fixtures";
import {
  SKIP_THIS_TIME,
  actionUnavailableReason,
  batchDays,
  carryOverDateProblem,
  draftProblem,
  groupRecoveryDays,
  initialDraft,
  moveRange,
  previewLines,
  skippedDays,
  toApplyCarryOverRequest,
  toApplyRequest,
  type RecoveryDraft,
} from "./recovery-helpers";

const today = "2026-09-16";
const week = goalFixture({ id: "w", type: "WEEK", startDate: "2026-09-14", endDate: "2026-09-20", version: 2 });
const withGoal = dayFixture({ id: "a", goalId: "w", title: "알고리즘", estimatedMinutes: 60, plannedDate: "2026-09-15", version: 1 });
const withoutGoal = dayFixture({ id: "b", title: "장보기", plannedDate: "2026-09-14", version: 5 });
const skipped = dayFixture({ id: "c", title: "운동", plannedDate: "2026-09-15" });

describe("Recovery actions", () => {
  it("bounds MOVE by the WEEK Goal, or only by today without a Goal", () => {
    expect(moveRange(week, today)).toEqual({ min: today, max: "2026-09-20" });
    expect(moveRange(undefined, today)).toEqual({ min: today, max: null });
    expect(moveRange(goalFixture({ startDate: "2026-09-07", endDate: "2026-09-13" }), today)).toBeNull();
  });

  it("explains unavailable actions instead of hiding them", () => {
    expect(actionUnavailableReason("CARRY_OVER", withoutGoal, moveRange(undefined, today))).not.toBeNull();
    expect(actionUnavailableReason("MOVE", withGoal, null)).not.toBeNull();
    expect(actionUnavailableReason("DROP", withGoal, null)).toBeNull();
  });

  it("validates REDUCE and MOVE drafts", () => {
    const reduce: RecoveryDraft = { ...initialDraft(withGoal, today), action: "REDUCE" };
    expect(reduce.estimatedMinutes).toBe(30);
    expect(draftProblem(withGoal, { ...reduce, estimatedMinutes: 60 }, null)).toBe("reduceMinutes");
    expect(draftProblem(withGoal, { ...reduce, title: " " }, null)).toBe("reduceTitle");
    expect(draftProblem(withGoal, { ...reduce, action: "MOVE", plannedDate: "2026-09-21" }, moveRange(week, today))).toBe("moveDate");
    expect(draftProblem(withoutGoal, { ...initialDraft(withoutGoal, today), action: "MOVE", plannedDate: "2026-12-01" }, moveRange(undefined, today))).toBeNull();
  });

  it("sends decided Days (KEEP included) and leaves out 이번엔 건너뛰기 and Carry Over Days", () => {
    const drafts: Record<string, RecoveryDraft> = {
      a: { ...initialDraft(withGoal, today), action: "REDUCE", estimatedMinutes: 20, title: "알고리즘 1문제" },
      b: { ...initialDraft(withoutGoal, today), action: "MOVE", plannedDate: "2026-09-30" },
      c: { ...initialDraft(skipped, today), action: SKIP_THIS_TIME },
    };
    const days = [withGoal, withoutGoal, skipped];
    expect(batchDays(days, drafts).map((day) => day.id)).toEqual(["a", "b"]);
    expect(skippedDays(days, drafts).map((day) => day.id)).toEqual(["c"]);
    expect(toApplyRequest(today, days, drafts)).toEqual({
      localDate: today,
      decisions: [
        { dayId: "a", version: 1, action: "REDUCE", estimatedMinutes: 20, title: "알고리즘 1문제" },
        { dayId: "b", version: 5, action: "MOVE", plannedDate: "2026-09-30" },
      ],
    });
    expect(previewLines(days, drafts).map((line) => line.detail)).toEqual(['60분 → 20분 · "알고리즘 1문제"', "9월 30일 (수)로 옮기기 (시간 배치 없이)"]);
    expect(toApplyRequest(today, [withGoal], {}).decisions).toEqual([{ dayId: "a", version: 1, action: "KEEP" }]);
    expect(toApplyRequest(today, [skipped], { c: drafts.c! }).decisions).toEqual([]);
  });
});

describe("Carry Over and Recovery Days", () => {
  it("rejects dates inside the source week or in the past", () => {
    expect(carryOverDateProblem("2026-09-18", today, week)).not.toBeNull();
    expect(carryOverDateProblem("2026-09-10", today, week)).not.toBeNull();
    expect(carryOverDateProblem("2026-09-21", today, week)).toBeNull();
  });

  it("applies exactly what the preview resolved", () => {
    const month = goalFixture({ id: "m", type: "MONTH", startDate: "2026-09-01", endDate: "2026-09-30", version: 7 });
    const preview: CarryOverPreviewResponse = {
      mode: "WITH_PLAN",
      ready: true,
      sourceDay: withGoal,
      sourceGoalPath: [month, week],
      targetDate: "2026-09-22",
      targetWeekGoalId: null,
      targetWeekGoals: [],
      levels: [
        { type: "MONTH", action: "KEEP_SOURCE", goal: month, candidates: [], newTitle: null, sourceGoal: month, startDate: "2026-09-01", endDate: "2026-09-30" },
        { type: "WEEK", action: "CREATE", goal: null, candidates: [], newTitle: "백엔드", sourceGoal: week, startDate: "2026-09-21", endDate: "2026-09-27" },
      ],
      days: [
        { day: withGoal, selected: true, selectable: true, exclusion: null },
        { day: skipped, selected: false, selectable: true, exclusion: null },
      ],
    };
    expect(toApplyCarryOverRequest(today, preview)).toEqual({
      localDate: today,
      sourceDayId: "a",
      targetDate: "2026-09-22",
      mode: "WITH_PLAN",
      targetWeekGoalId: null,
      levels: [{ type: "WEEK", goalId: null, create: true }],
      days: [{ id: "a", version: 1 }],
      goals: [
        { id: "m", version: 7 },
        { id: "w", version: 2 },
      ],
    });
  });

  it("groups Recovery Days into today, upcoming and past", () => {
    const day = (date: string) => ({ id: date, date, returnDate: null, note: "", createdAt: "", updatedAt: "", version: 0 });
    const groups = groupRecoveryDays([day("2026-09-10"), day("2026-09-20"), day(today), day("2026-09-18")], today);
    expect(groups.today.map((entry) => entry.date)).toEqual([today]);
    expect(groups.upcoming.map((entry) => entry.date)).toEqual(["2026-09-18", "2026-09-20"]);
    expect(groups.past.map((entry) => entry.date)).toEqual(["2026-09-10"]);
  });
});