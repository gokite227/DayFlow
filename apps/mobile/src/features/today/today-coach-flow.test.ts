import type { CoachSuggestion, DayResponse, TodayCoachResponse, UpdateDayRequest } from "@dayflow/api-client";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-error";
import {
  COACH_ERROR_COPY,
  coachErrorKind,
  createTodayCoachFlow,
  describeSuggestionChange,
  planSuggestionApply,
  priorityLabel,
  suggestionKey,
  type TodayCoachDeps,
} from "./today-coach-flow";

const day = (patch: Partial<DayResponse> = {}): DayResponse => ({
  id: "day-1",
  goalId: null,
  title: "보고서 초안",
  status: "NOT_STARTED",
  priority: "MEDIUM",
  estimatedMinutes: 30,
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

const reschedule: CoachSuggestion = {
  type: "RESCHEDULE_DAY",
  dayId: "day-1",
  dayTitle: "보고서 초안",
  message: "오늘로 옮겨 보세요.",
  proposedDate: "2031-03-05",
  proposedPriority: null,
};
const setPriority: CoachSuggestion = {
  type: "SET_PRIORITY",
  dayId: "day-1",
  dayTitle: "보고서 초안",
  message: "먼저 챙겨 보세요.",
  proposedDate: null,
  proposedPriority: "HIGH",
};
const advice: CoachSuggestion = {
  type: "ADVICE_ONLY",
  dayId: null,
  dayTitle: null,
  message: "하나씩 해 보세요.",
  proposedDate: null,
  proposedPriority: null,
};

const response: TodayCoachResponse = {
  generatedAt: "2031-03-05T00:00:00Z",
  localDate: "2031-03-05",
  headline: "오늘은 두 가지에 집중해요",
  summary: "핵심 Day부터 시작해 보세요.",
  priorities: [{ dayId: "day-1", dayTitle: "보고서 초안", reason: "마감이 가까워요" }],
  observations: [
    { message: "남은 Day가 1개예요.", evidence: [{ type: "METRIC", id: "todayOpenCount", label: "오늘 남은 Day 1개" }] },
  ],
  suggestions: [reschedule, setPriority, advice],
};

const problem = (status: number, code: string) =>
  new ApiError(status, { title: code, status, detail: code, instance: "/", code, fieldErrors: [], traceId: "t" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<TodayCoachDeps> = {}) {
  const deps = {
    requestCoach: vi.fn(async () => response),
    loadDay: vi.fn(async () => day()),
    patchDay: vi.fn(async (_dayId: string, body: UpdateDayRequest) => day(body as Partial<DayResponse>)),
    confirm: vi.fn(async () => true),
    ...overrides,
  };
  return { deps, flow: createTodayCoachFlow(deps) };
}

describe("Today Coach request", () => {
  it("does not call the Coach until the user asks", () => {
    const { deps, flow } = setup();
    expect(flow.getState().status).toBe("idle");
    expect(deps.requestCoach).not.toHaveBeenCalled();
  });

  it("shows loading, then the result", async () => {
    const pending = deferred<TodayCoachResponse>();
    const { deps, flow } = setup({ requestCoach: vi.fn(() => pending.promise) });
    const listener = vi.fn();
    flow.subscribe(listener);

    const done = flow.request("2031-03-05", "Asia/Seoul");
    expect(flow.getState().status).toBe("loading");
    expect(deps.requestCoach).toHaveBeenCalledWith({ localDate: "2031-03-05", timezone: "Asia/Seoul" });

    pending.resolve(response);
    await done;
    expect(flow.getState().status).toBe("success");
    expect(flow.getState().result?.headline).toBe("오늘은 두 가지에 집중해요");
    expect(listener).toHaveBeenCalled();
  });

  it("ignores repeated taps while a request is running", async () => {
    const pending = deferred<TodayCoachResponse>();
    const { deps, flow } = setup({ requestCoach: vi.fn(() => pending.promise) });

    const first = flow.request("2031-03-05", "Asia/Seoul");
    void flow.request("2031-03-05", "Asia/Seoul");
    void flow.request("2031-03-05", "Asia/Seoul");
    pending.resolve(response);
    await first;

    expect(deps.requestCoach).toHaveBeenCalledTimes(1);
  });

  it("maps errors to the Coach copy and can retry", async () => {
    const requestCoach = vi
      .fn<TodayCoachDeps["requestCoach"]>()
      .mockRejectedValueOnce(problem(503, "AI_COACH_UNAVAILABLE"))
      .mockRejectedValueOnce(problem(429, "AI_RATE_LIMITED"))
      .mockRejectedValueOnce(problem(502, "AI_COACH_FAILED"))
      .mockResolvedValueOnce(response);
    const { flow } = setup({ requestCoach });

    await flow.request("2031-03-05", "Asia/Seoul");
    expect(flow.getState()).toMatchObject({ status: "error", error: "unavailable" });
    await flow.request("2031-03-05", "Asia/Seoul");
    expect(flow.getState().error).toBe("rate_limited");
    await flow.request("2031-03-05", "Asia/Seoul");
    expect(flow.getState().error).toBe("failed");

    await flow.request("2031-03-05", "Asia/Seoul");
    expect(flow.getState()).toMatchObject({ status: "success", error: null });
    expect(requestCoach).toHaveBeenCalledTimes(4);
  });

  it("uses the product copy for each error", () => {
    expect(COACH_ERROR_COPY[coachErrorKind(problem(503, "AI_COACH_UNAVAILABLE"))]).toBe("AI 코치가 아직 연결되지 않았어요.");
    expect(COACH_ERROR_COPY[coachErrorKind(problem(429, "AI_RATE_LIMITED"))]).toBe(
      "AI 코치를 잠시 많이 사용했어요. 잠시 후 다시 시도해 주세요.",
    );
    expect(COACH_ERROR_COPY[coachErrorKind(new TypeError("Failed to fetch"))]).toBe("지금은 코치의 답변을 불러오지 못했어요.");
    expect(coachErrorKind(problem(409, "AI_COACH_BUSY"))).toBe("busy");
  });
});

describe("Today Coach apply", () => {
  async function withResult(overrides: Partial<TodayCoachDeps> = {}) {
    const context = setup(overrides);
    await context.flow.request("2031-03-05", "Asia/Seoul");
    return context;
  }

  it("reloads the Day, asks for confirmation and patches with the latest version", async () => {
    const { deps, flow } = await withResult();

    await flow.apply(reschedule, 0);

    expect(deps.loadDay).toHaveBeenCalledWith("day-1");
    expect(deps.confirm).toHaveBeenCalledWith('"보고서 초안" Day를 3월 5일로 이동할까요?');
    expect(deps.patchDay).toHaveBeenCalledWith("day-1", { plannedDate: "2031-03-05", version: 3 });
    expect(flow.getState().applied[suggestionKey(reschedule, 0)]).toBe("적용했어요.");
    expect(flow.getState().applying).toBeNull();
  });

  it("does nothing when the user cancels", async () => {
    const { deps, flow } = await withResult({ confirm: vi.fn(async () => false) });
    await flow.apply(setPriority, 1);
    expect(deps.patchDay).not.toHaveBeenCalled();
    expect(flow.getState().applied).toEqual({});
  });

  it("never applies to a Day that is already done", async () => {
    const { deps, flow } = await withResult({ loadDay: vi.fn(async () => day({ status: "DONE" })) });
    await flow.apply(setPriority, 1);
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.patchDay).not.toHaveBeenCalled();
    expect(flow.getState().applyError?.message).toContain("이미 끝냈거나");
  });

  it("keeps the server error when the PATCH fails", async () => {
    const failure = problem(400, "DATE_OUTSIDE_GOAL_PERIOD");
    const { flow } = await withResult({ patchDay: vi.fn(async () => Promise.reject(failure)) });
    await flow.apply(reschedule, 0);
    expect(flow.getState().applyError).toEqual({ key: suggestionKey(reschedule, 0), message: null, error: failure });
    expect(flow.getState().applied).toEqual({});
  });

  it("ignores a second apply while one is running and advice-only suggestions", async () => {
    const pending = deferred<DayResponse>();
    const { deps, flow } = await withResult({ loadDay: vi.fn(() => pending.promise) });

    const first = flow.apply(reschedule, 0);
    await flow.apply(setPriority, 1);
    await flow.apply(advice, 2);
    pending.resolve(day());
    await first;

    expect(deps.loadDay).toHaveBeenCalledTimes(1);
    expect(deps.patchDay).toHaveBeenCalledTimes(1);
  });

  it("does not patch when the change is already true", async () => {
    const { deps, flow } = await withResult({ loadDay: vi.fn(async () => day({ priority: "HIGH" })) });
    await flow.apply(setPriority, 1);
    expect(deps.patchDay).not.toHaveBeenCalled();
    expect(flow.getState().applied[suggestionKey(setPriority, 1)]).toBe("이미 그 우선순위예요.");
  });
});

describe("suggestion texts", () => {
  it("never shows priority enums to the user", () => {
    expect(priorityLabel("HIGH")).toBe("높음");
    expect(priorityLabel("MEDIUM")).toBe("보통");
    expect(priorityLabel("LOW")).toBe("낮음");
    for (const priority of ["NONE", "LOW", "MEDIUM", "HIGH"] as const) {
      const suggestion = { ...setPriority, proposedPriority: priority };
      expect(describeSuggestionChange(suggestion)).not.toMatch(/NONE|LOW|MEDIUM|HIGH/);
      const plan = planSuggestionApply(
        suggestion as Parameters<typeof planSuggestionApply>[0],
        day({ priority: priority === "HIGH" ? "LOW" : "HIGH" }),
      );
      expect(plan.kind === "patch" && plan.confirmMessage).not.toMatch(/NONE|LOW|MEDIUM|HIGH/);
    }
    const highPlan = planSuggestionApply(setPriority as Parameters<typeof planSuggestionApply>[0], day());
    expect(highPlan.kind === "patch" && highPlan.confirmMessage).toBe('"보고서 초안" Day의 우선순위를 높음으로 변경할까요?');
  });

  it("describes the change and mentions a moving time placement", () => {
    expect(describeSuggestionChange(reschedule)).toBe("3월 5일로 이동");
    expect(describeSuggestionChange(setPriority)).toBe("우선순위를 높음으로 변경");
    expect(describeSuggestionChange(advice)).toBeNull();

    const scheduled = day({
      schedule: {
        id: "s",
        dayId: "day-1",
        startAt: "2031-03-04T09:00:00+09:00",
        endAt: "2031-03-04T10:00:00+09:00",
        timezone: "Asia/Seoul",
        version: 0,
      } as DayResponse["schedule"],
    });
    const plan = planSuggestionApply(reschedule as Parameters<typeof planSuggestionApply>[0], scheduled);
    expect(plan.kind === "patch" && plan.confirmMessage).toContain("시간 배치도 같은 시간으로 함께 옮겨져요.");
  });
});
