import type { DayResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { draftProblem, initialDraft, moveRange, previewLines, toApplyRequest, type RecoveryDraft } from "./recovery-plan";

const base: DayResponse = {
  id: "a",
  goalId: "week",
  title: "Write API",
  status: "NOT_STARTED",
  priority: "LOW",
  tags: [],
  estimatedMinutes: 90,
  plannedDate: "2026-09-14",
  planningMode: "ANYTIME",
  coreDay: true,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 3,
  schedule: null,
};
const week = { startDate: "2026-09-14", endDate: "2026-09-20" };
const today = "2026-09-16";

describe("REC-001 recovery plan", () => {
  it("starts every Day as KEEP with a halved estimate ready for REDUCE", () => {
    expect(initialDraft(base, "2026-09-16")).toEqual({ action: "KEEP", estimatedMinutes: 45, title: "Write API", plannedDate: "2026-09-16" });
    expect(initialDraft({ ...base, estimatedMinutes: 1 }, null)).toMatchObject({ estimatedMinutes: 1, plannedDate: "" });
  });

  it("allows MOVE only from today to the end of the WEEK Goal", () => {
    expect(moveRange(week, today)).toEqual({ min: "2026-09-16", max: "2026-09-20" });
    expect(moveRange({ startDate: "2026-09-21", endDate: "2026-09-27" }, today)).toEqual({ min: "2026-09-21", max: "2026-09-27" });
    expect(moveRange({ startDate: "2026-09-07", endDate: "2026-09-13" }, today)).toBeNull();
  });

  it("DAY-001 lets a Day without a Goal move to today or any later date", () => {
    const range = moveRange(undefined, today);

    expect(range).toEqual({ min: today, max: null });
    const draft = (plannedDate: string): RecoveryDraft => ({ ...initialDraft(base, today), action: "MOVE", plannedDate });
    expect(draftProblem(base, draft("2026-12-31"), range)).toBeNull();
    expect(draftProblem(base, draft("2026-09-15"), range)).toBe("moveDate");
  });

  it("rejects a REDUCE that is not smaller, a blank title and a MOVE outside the range", () => {
    const range = moveRange(week, today);
    const draft = (change: Partial<RecoveryDraft>): RecoveryDraft => ({ ...initialDraft(base, today), ...change });
    expect(draftProblem(base, draft({ action: "REDUCE", estimatedMinutes: 90 }), range)).toBe("reduceMinutes");
    expect(draftProblem(base, draft({ action: "REDUCE", estimatedMinutes: Number.NaN }), range)).toBe("reduceMinutes");
    expect(draftProblem(base, draft({ action: "REDUCE", title: "  " }), range)).toBe("reduceTitle");
    expect(draftProblem(base, draft({ action: "MOVE", plannedDate: "2026-09-15" }), range)).toBe("moveDate");
    expect(draftProblem(base, draft({ action: "MOVE", plannedDate: "2026-09-18" }), null)).toBe("moveDate");
    expect(draftProblem(base, draft({ action: "MOVE", plannedDate: "2026-09-18" }), range)).toBeNull();
    expect(draftProblem(base, draft({ action: "DROP" }), null)).toBeNull();
  });

  it("previews non-KEEP changes and sends every decision with the previewed version", () => {
    const days = [base, { ...base, id: "b", title: "Docs" }, { ...base, id: "c", title: "Tests" }, { ...base, id: "d", title: "Keep" }];
    const drafts: Record<string, RecoveryDraft> = {
      a: { action: "REDUCE", estimatedMinutes: 30, title: "Write API skeleton", plannedDate: "" },
      b: { action: "MOVE", estimatedMinutes: 45, title: "Docs", plannedDate: "2026-09-17" },
      c: { action: "DROP", estimatedMinutes: 45, title: "Tests", plannedDate: "" },
    };

    expect(previewLines(days, drafts).map((line) => line.detail)).toEqual([
      '90분 → 30분 · "Write API skeleton"',
      "THU 9/17로 이동 (시간 배치 없이)",
      "이번 계획에서 내려놓기 (기록은 남아요)",
    ]);
    expect(toApplyRequest(today, days, drafts)).toEqual({
      localDate: today,
      decisions: [
        { dayId: "a", version: 3, action: "REDUCE", estimatedMinutes: 30, title: "Write API skeleton" },
        { dayId: "b", version: 3, action: "MOVE", plannedDate: "2026-09-17" },
        { dayId: "c", version: 3, action: "DROP" },
        { dayId: "d", version: 3, action: "KEEP" },
      ],
    });
  });
});
