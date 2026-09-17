import type { DayResponse, RecoveryCoachResponse, RecoveryRecommendation } from "@dayflow/api-client";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-error";
import {
  RECOVERY_COACH_ERROR_COPY,
  createRecoveryCoachFlow,
  draftFromRecommendation,
  recommendationFor,
  recommendationUsable,
} from "./recovery-coach-flow";
import { initialDraft, moveRange, toApplyRequest } from "./recovery-helpers";

const TODAY = "2026-09-18";

const day = (patch: Partial<DayResponse> = {}): DayResponse => ({
  id: "day-1",
  goalId: null,
  title: "서랍 정리",
  status: "NOT_STARTED",
  priority: "LOW",
  estimatedMinutes: 60,
  plannedDate: "2026-09-15",
  planningMode: "ANYTIME",
  coreDay: false,
  tags: [],
  carriedFromDayId: null,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  version: 4,
  schedule: null,
  ...patch,
});

const recommendation = (patch: Partial<RecoveryRecommendation>): RecoveryRecommendation => ({
  dayId: "day-1",
  dayTitle: "서랍 정리",
  action: "MOVE",
  targetDate: "2026-09-19",
  reason: "9월 19일(토) 남은 Day 1개",
  evidence: [{ key: "LOAD_2026_09_19", label: "9월 19일(토) 남은 Day 1개 · 시간 배치 30분" }],
  ...patch,
});

const response = (recommendations: RecoveryRecommendation[]): RecoveryCoachResponse => ({
  generatedAt: "2026-09-18T00:00:00Z",
  localDate: TODAY,
  headline: "남은 Day를 정리해요",
  summary: "정리할 Day 1개",
  observations: [],
  recommendations,
  candidateCount: 1,
  reviewedCount: 1,
});

const periodGoal = { kind: "PERIOD" as const, startDate: "2026-09-01", endDate: "2026-09-20" };
const weekGoal = { kind: "CALENDAR" as const, startDate: "2026-09-14", endDate: "2026-09-20" };
const endedWeek = { kind: "CALENDAR" as const, startDate: "2026-09-07", endDate: "2026-09-13" };

const problem = (status: number, code: string) =>
  new ApiError(status, { title: code, status, detail: code, instance: "/", code, fieldErrors: [], traceId: "t" });

describe("Recovery Coach request", () => {
  it("never calls on its own, once per tap, and maps errors", async () => {
    const requestRecommendations = vi
      .fn<(body: unknown) => Promise<RecoveryCoachResponse>>()
      .mockRejectedValueOnce(problem(429, "AI_RATE_LIMITED"))
      .mockResolvedValueOnce(response([recommendation({})]));
    const flow = createRecoveryCoachFlow({ requestRecommendations });
    expect(requestRecommendations).not.toHaveBeenCalled();

    const first = flow.request({ localDate: TODAY, timezone: "Asia/Seoul" });
    void flow.request({ localDate: TODAY, timezone: "Asia/Seoul" });
    await first;
    expect(requestRecommendations).toHaveBeenCalledTimes(1);
    expect(RECOVERY_COACH_ERROR_COPY[flow.getState().error!]).toBe("AI 코치를 잠시 많이 사용했어요. 잠시 후 다시 시도해 주세요.");

    await flow.request({ localDate: TODAY, timezone: "Asia/Seoul" });
    expect(flow.getState().status).toBe("success");
    expect(RECOVERY_COACH_ERROR_COPY.failed).toBe("지금은 정리 제안을 만들지 못했어요.");
  });
});

describe("Using a recommendation", () => {
  it("finds a recommendation only for a Day that is still a candidate", () => {
    const result = response([recommendation({ dayId: "gone" })]);
    expect(recommendationFor(result, "day-1")).toBeNull();
    expect(recommendationFor(null, "day-1")).toBeNull();
  });

  it("only pre-fills the Day's choice: nothing is sent until the existing preview is confirmed", () => {
    const current = initialDraft(day(), TODAY);
    const draft = draftFromRecommendation(recommendation({}), current);
    expect(draft).toEqual({ ...current, action: "MOVE", plannedDate: "2026-09-19" });

    // The single-Day preview sends exactly this Day with its version, and nothing for other Days.
    const request = toApplyRequest(TODAY, [day()], { "day-1": draft });
    expect(request.decisions).toEqual([{ dayId: "day-1", version: 4, action: "MOVE", plannedDate: "2026-09-19" }]);
  });

  it("REDUCE keeps the user's estimate to edit; DROP and KEEP carry no date", () => {
    const current = initialDraft(day(), TODAY);
    expect(draftFromRecommendation(recommendation({ action: "REDUCE", targetDate: null }), current)).toEqual({
      ...current,
      action: "REDUCE",
    });
    const drop = draftFromRecommendation(recommendation({ action: "DROP", targetDate: null }), current);
    expect(toApplyRequest(TODAY, [day()], { "day-1": drop }).decisions).toEqual([{ dayId: "day-1", version: 4, action: "DROP" }]);
  });

  it("hides recommendations the current plan no longer allows", () => {
    const goalless = day();
    expect(recommendationUsable(recommendation({}), goalless, undefined, moveRange(undefined, TODAY), TODAY)).toBe(true);
    // A date before today (the plan changed since the answer).
    expect(recommendationUsable(recommendation({ targetDate: "2026-09-17" }), goalless, undefined, moveRange(undefined, TODAY), TODAY)).toBe(false);

    // PERIOD Goal Day: never CARRY_OVER, MOVE only inside the period.
    const periodDay = day({ goalId: "period" });
    const periodRange = moveRange(periodGoal, TODAY);
    expect(recommendationUsable(recommendation({ action: "CARRY_OVER", targetDate: "2026-09-21" }), periodDay, periodGoal, periodRange, TODAY)).toBe(false);
    expect(recommendationUsable(recommendation({ targetDate: "2026-09-21" }), periodDay, periodGoal, periodRange, TODAY)).toBe(false);
    expect(recommendationUsable(recommendation({ targetDate: "2026-09-20" }), periodDay, periodGoal, periodRange, TODAY)).toBe(true);

    // CALENDAR WEEK: CARRY_OVER only outside the week; an ended week cannot MOVE.
    const weekDay = day({ goalId: "week" });
    expect(recommendationUsable(recommendation({ action: "CARRY_OVER", targetDate: "2026-09-19" }), weekDay, weekGoal, moveRange(weekGoal, TODAY), TODAY)).toBe(false);
    expect(recommendationUsable(recommendation({ action: "CARRY_OVER", targetDate: "2026-09-21" }), weekDay, weekGoal, moveRange(weekGoal, TODAY), TODAY)).toBe(true);
    expect(recommendationUsable(recommendation({ targetDate: "2026-09-19" }), weekDay, endedWeek, moveRange(endedWeek, TODAY), TODAY)).toBe(false);
  });
});
