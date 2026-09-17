import type { DayResponse, PlanningCoachResponse, PlanningDayProposal, PlanningDaySuggestion } from "@dayflow/api-client";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-error";
import { addDays, startOfWeek } from "../../lib/dates";
import { scheduleRequest } from "../calendar/calendar-grid";
import {
  PLANNING_COACH_ERROR_COPY,
  createPlanningCoachFlow,
  describeSuggestionChange,
  isApplicableSuggestion,
  planSuggestionApply,
  planningWeekStarts,
  proposalKey,
  proposalRequest,
  suggestionKey,
  type PlanningCoachDeps,
} from "./planning-coach-flow";

const day = (patch: Partial<DayResponse> = {}): DayResponse => ({
  id: "day-1",
  goalId: "goal-1",
  title: "영어 복습",
  status: "NOT_STARTED",
  priority: "MEDIUM",
  estimatedMinutes: 60,
  plannedDate: "2031-03-04",
  planningMode: "ANYTIME",
  coreDay: false,
  tags: [],
  carriedFromDayId: null,
  createdAt: "2031-03-01T00:00:00Z",
  updatedAt: "2031-03-01T00:00:00Z",
  version: 3,
  schedule: null,
  ...patch,
});

const schedule = (date: string, start: number, length: number): NonNullable<DayResponse["schedule"]> => ({
  id: "schedule-1",
  dayId: "day-1",
  startAt: scheduleRequest(date, start, length, null, "Asia/Seoul").startAt,
  endAt: scheduleRequest(date, start, length, null, "Asia/Seoul").endAt,
  timezone: "Asia/Seoul",
  createdAt: "2031-03-01T00:00:00Z",
  updatedAt: "2031-03-01T00:00:00Z",
  version: 7,
});

const suggestion = (patch: Partial<PlanningDaySuggestion>): PlanningDaySuggestion => ({
  dayId: "day-1",
  dayTitle: "영어 복습",
  type: "SET_DATE",
  targetDate: "2031-03-05",
  startTime: null,
  endTime: null,
  priority: null,
  reason: "3월 4일(화) 남은 Day 3개",
  evidence: [{ key: "LOAD_2031_03_04", label: "3월 4일(화) 남은 Day 3개" }],
  ...patch,
});

const proposal: PlanningDayProposal = {
  title: "저녁 일정 점검",
  proposedDate: "2031-03-06",
  priority: "LOW",
  reason: "지난 주간 회고 TRY: '저녁 일정 줄이기'",
  evidence: [{ key: "PREVIOUS_TRY_1", label: "지난 주간 회고 TRY: '저녁 일정 줄이기'" }],
};

const response = (patch: Partial<PlanningCoachResponse> = {}): PlanningCoachResponse => ({
  generatedAt: "2031-03-01T00:00:00Z",
  goalId: "goal-1",
  targetStart: "2031-03-03",
  targetEnd: "2031-03-09",
  headline: "다음 주 계획을 점검했어요",
  summary: "",
  observations: [],
  suggestions: [suggestion({})],
  proposals: [proposal],
  facts: [],
  ...patch,
});

function deps(patch: Partial<PlanningCoachDeps> = {}): PlanningCoachDeps {
  return {
    requestPlanning: vi.fn(async () => response()),
    loadDay: vi.fn(async () => day()),
    patchDay: vi.fn(async () => day()),
    putSchedule: vi.fn(async () => ({})),
    createDay: vi.fn(async () => day({ id: "day-new" })),
    confirm: vi.fn(async () => true),
    timeZone: () => "Asia/Seoul",
    ...patch,
  };
}

const body = { goalId: "goal-1", weekStart: null, timezone: "Asia/Seoul" };

describe("planning coach flow", () => {
  it("asks only when requested and never twice at once", async () => {
    const d = deps();
    const flow = createPlanningCoachFlow(d);
    expect(flow.getState().status).toBe("idle");
    expect(d.requestPlanning).not.toHaveBeenCalled();
    const first = flow.request(body);
    void flow.request(body);
    await first;
    expect(d.requestPlanning).toHaveBeenCalledTimes(1);
    expect(flow.getState().status).toBe("success");
  });

  it("maps coach errors to copy without changing Days", async () => {
    const d = deps({
      requestPlanning: vi.fn(async () => {
        throw new ApiError(429, { type: "about:blank", title: "", status: 429, detail: "", code: "AI_RATE_LIMITED" } as never);
      }),
    });
    const flow = createPlanningCoachFlow(d);
    await flow.request(body);
    expect(flow.getState().error).toBe("rate_limited");
    expect(PLANNING_COACH_ERROR_COPY.failed).toContain("계획");
    expect(d.patchDay).not.toHaveBeenCalled();
  });

  it("applies one suggestion after reloading the Day and confirming", async () => {
    const d = deps();
    const flow = createPlanningCoachFlow(d);
    await flow.request(body);
    const [first] = flow.getState().result!.suggestions;
    await flow.applySuggestion(first!, 0);
    expect(d.loadDay).toHaveBeenCalledWith("day-1");
    expect(d.confirm).toHaveBeenCalledTimes(1);
    expect(d.patchDay).toHaveBeenCalledWith("day-1", { plannedDate: "2031-03-05", version: 3 });
    expect(flow.getState().applied[suggestionKey(first!, 0)]).toBe("적용했어요.");
    // Applying the same suggestion again does nothing.
    await flow.applySuggestion(first!, 0);
    expect(d.patchDay).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the user cancels", async () => {
    const d = deps({ confirm: vi.fn(async () => false) });
    const flow = createPlanningCoachFlow(d);
    await flow.request(body);
    await flow.applySuggestion(suggestion({}), 0);
    await flow.createProposal(proposal, 0);
    expect(d.patchDay).not.toHaveBeenCalled();
    expect(d.createDay).not.toHaveBeenCalled();
    expect(flow.getState().applying).toBeNull();
  });

  it("refuses finished Days and reports server rule errors", async () => {
    const finished = deps({ loadDay: vi.fn(async () => day({ status: "DONE" })) });
    const flow = createPlanningCoachFlow(finished);
    await flow.request(body);
    await flow.applySuggestion(suggestion({}), 0);
    expect(finished.patchDay).not.toHaveBeenCalled();
    expect(flow.getState().applyError?.message).toContain("이미 끝냈거나");

    const conflict = new ApiError(409, { status: 409, code: "VERSION_CONFLICT" } as never);
    const failing = deps({ patchDay: vi.fn(async () => Promise.reject(conflict)) });
    const second = createPlanningCoachFlow(failing);
    await second.request(body);
    await second.applySuggestion(suggestion({}), 0);
    expect(second.getState().applyError?.error).toBe(conflict);
    expect(second.getState().applying).toBeNull();
  });

  it("creates a proposed Day only after confirmation, linked to the Goal", async () => {
    const d = deps();
    const flow = createPlanningCoachFlow(d);
    await flow.createProposal(proposal, 0);
    expect(d.confirm).not.toHaveBeenCalled(); // no result yet
    await flow.request(body);
    await flow.createProposal(proposal, 0);
    expect(d.confirm).toHaveBeenCalledWith(expect.stringContaining("저녁 일정 점검"));
    expect(d.createDay).toHaveBeenCalledWith(proposalRequest(proposal, "goal-1"));
    expect(flow.getState().applied[proposalKey(0)]).toBe("Day를 만들었어요.");
    await flow.createProposal(proposal, 0);
    expect(d.createDay).toHaveBeenCalledTimes(1);
  });

  it("ignores a second apply while one is running (no batch apply)", async () => {
    let release: () => void = () => undefined;
    const d = deps({ loadDay: vi.fn(() => new Promise<DayResponse>((resolve) => (release = () => resolve(day())))) });
    const flow = createPlanningCoachFlow(d);
    await flow.request(body);
    const running = flow.applySuggestion(suggestion({}), 0);
    await flow.applySuggestion(suggestion({ type: "SET_PRIORITY", targetDate: null, priority: "LOW" }), 1);
    await flow.createProposal(proposal, 0);
    release();
    await running;
    expect(d.loadDay).toHaveBeenCalledTimes(1);
    expect(d.createDay).not.toHaveBeenCalled();
  });
});

describe("planning apply plans", () => {
  it("moves a schedule keeping its length", () => {
    const current = day({ schedule: schedule("2031-03-04", 20 * 60, 90) });
    const plan = planSuggestionApply(
      suggestion({ type: "SET_SCHEDULE", targetDate: "2031-03-05", startTime: "10:00", endTime: "11:30" }),
      current,
      "Asia/Seoul",
    );
    expect(plan).toMatchObject({
      kind: "schedule",
      body: { startAt: "2031-03-05T10:00:00+09:00", endAt: "2031-03-05T11:30:00+09:00", expectedVersion: 7 },
    });
  });

  it("does not schedule a Day without a placement or past midnight", () => {
    const move = suggestion({ type: "SET_SCHEDULE", targetDate: "2031-03-05", startTime: "23:30", endTime: null });
    expect(planSuggestionApply(move, day(), "Asia/Seoul").kind).toBe("blocked");
    expect(planSuggestionApply(move, day({ schedule: schedule("2031-03-04", 600, 60) }), "Asia/Seoul").kind).toBe("blocked");
  });

  it("recognizes suggestions that are already true", () => {
    expect(planSuggestionApply(suggestion({ targetDate: "2031-03-04" }), day(), "UTC").kind).toBe("already");
    expect(
      planSuggestionApply(suggestion({ type: "SET_PRIORITY", targetDate: null, priority: "MEDIUM" }), day(), "UTC").kind,
    ).toBe("already");
  });

  it("describes changes in Korean and leaves OPEN_DAY to the user", () => {
    const open = suggestion({ type: "OPEN_DAY", targetDate: null });
    expect(isApplicableSuggestion(open)).toBe(false);
    expect(describeSuggestionChange(open)).toBe("Day를 열어 직접 확인하기");
    expect(describeSuggestionChange(suggestion({ type: "SET_PRIORITY", targetDate: null, priority: "HIGH" }))).toBe(
      "우선순위 높음",
    );
    expect(describeSuggestionChange(suggestion({}))).not.toMatch(/SET_|HIGH/);
  });

  it("derives the plannable weeks of a period", () => {
    const goal = { startDate: "2031-03-01", endDate: "2031-03-12" };
    expect(planningWeekStarts(goal, "2031-03-05", startOfWeek, addDays)).toEqual(["2031-03-03", "2031-03-10"]);
    expect(planningWeekStarts(goal, "2031-03-11", startOfWeek, addDays)).toEqual(["2031-03-10"]);
    expect(planningWeekStarts(goal, "2031-03-13", startOfWeek, addDays)).toEqual([]);
  });
});
