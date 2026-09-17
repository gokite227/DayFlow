import type { ReviewCoachResponse, ReviewItemResponse, ReviewResponse, SaveReviewRequest } from "@dayflow/api-client";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-error";
import {
  REVIEW_COACH_ERROR_COPY,
  createReviewCoachFlow,
  draftLinesFrom,
  draftSaveRequest,
  replacedCount,
  type ReviewCoachDeps,
} from "./review-coach-flow";

const evidence = [{ key: "CORE_COMPLETION", label: "핵심 Day 4개 중 3개 완료" }];

const draft: ReviewCoachResponse = {
  generatedAt: "2026-08-10T00:00:00Z",
  type: "WEEK",
  periodStart: "2026-08-03",
  periodEnd: "2026-08-09",
  headline: "일정 밀도를 조절하는 게 핵심이에요",
  summary: "계획한 Day 14개 중 9개 완료",
  highlights: [{ message: "핵심 Day 4개 중 3개 완료", evidence }],
  keep: [
    { text: "핵심 Day를 먼저 배치하기", reason: "핵심 Day 4개 중 3개 완료", evidence },
    { text: "오전 일정 밀도 유지", reason: "근거", evidence },
  ],
  problem: [{ text: "저녁 일정이 과밀했어요", reason: "근거", evidence }],
  try: [{ text: "저녁에는 Day를 하루 1개만 배치하기", reason: "근거", evidence }],
  facts: evidence,
};

const item = (patch: Partial<ReviewItemResponse>): ReviewItemResponse => ({
  id: "item",
  kind: "KEEP",
  content: "직접 쓴 Keep",
  convertedDayId: null,
  goalId: null,
  targetGoalId: null,
  ...patch,
});

const review = (items: ReviewItemResponse[]): ReviewResponse => ({
  id: "review",
  type: "WEEK",
  periodStart: "2026-08-03",
  periodEnd: "2026-08-09",
  rating: 4,
  completed: false,
  items,
  createdAt: "2026-08-09T00:00:00Z",
  updatedAt: "2026-08-09T00:00:00Z",
  version: 2,
});

const body = { type: "WEEK", periodStart: "2026-08-03", timezone: "Asia/Seoul" } as const;

const problem = (status: number, code: string) =>
  new ApiError(status, { title: code, status, detail: code, instance: "/", code, fieldErrors: [], traceId: "t" });

function setup(overrides: Partial<ReviewCoachDeps> = {}) {
  const deps = { requestDraft: vi.fn(async () => draft), ...overrides };
  return { deps, flow: createReviewCoachFlow(deps) };
}

async function withDraft(overrides: Partial<ReviewCoachDeps> = {}) {
  const context = setup(overrides);
  await context.flow.request(body);
  return context;
}

describe("Review Coach request", () => {
  it("does not call the Coach until the user asks", () => {
    const { deps, flow } = setup();
    expect(flow.getState().status).toBe("idle");
    expect(deps.requestDraft).not.toHaveBeenCalled();
  });

  it("calls once per tap, shows loading, then the draft", async () => {
    let resolve!: (value: ReviewCoachResponse) => void;
    const { deps, flow } = setup({ requestDraft: vi.fn(() => new Promise<ReviewCoachResponse>((r) => (resolve = r))) });

    const first = flow.request(body);
    void flow.request(body);
    expect(flow.getState().status).toBe("loading");
    resolve(draft);
    await first;

    expect(deps.requestDraft).toHaveBeenCalledTimes(1);
    expect(deps.requestDraft).toHaveBeenCalledWith(body);
    expect(flow.getState().status).toBe("success");
    expect(flow.getState().result?.keep).toHaveLength(2);
    // Showing the draft changes nothing in the editor yet.
    expect(flow.getState().drafts).toEqual([]);
  });

  it("maps errors to the Review copy and retries on demand", async () => {
    const requestDraft = vi
      .fn<ReviewCoachDeps["requestDraft"]>()
      .mockRejectedValueOnce(problem(503, "AI_COACH_UNAVAILABLE"))
      .mockRejectedValueOnce(problem(429, "AI_RATE_LIMITED"))
      .mockRejectedValueOnce(problem(502, "AI_COACH_FAILED"))
      .mockResolvedValueOnce(draft);
    const { flow } = setup({ requestDraft });

    await flow.request(body);
    expect(REVIEW_COACH_ERROR_COPY[flow.getState().error!]).toBe("AI 코치가 아직 연결되지 않았어요.");
    await flow.request(body);
    expect(REVIEW_COACH_ERROR_COPY[flow.getState().error!]).toBe("AI 코치를 잠시 많이 사용했어요. 잠시 후 다시 시도해 주세요.");
    await flow.request(body);
    expect(REVIEW_COACH_ERROR_COPY[flow.getState().error!]).toBe("지금은 회고 초안을 만들지 못했어요.");
    await flow.request(body);
    expect(flow.getState()).toMatchObject({ status: "success", error: null });
    expect(requestDraft).toHaveBeenCalledTimes(4);
  });
});

describe("Applying a draft", () => {
  it("fills an empty editor with one line per KPT item and saves nothing", async () => {
    const { flow } = await withDraft();
    const save = vi.fn();

    flow.applyDraft(null, false);

    expect(flow.getState().conflict).toBe(false);
    expect(flow.getState().drafts.map((line) => [line.kind, line.content])).toEqual([
      ["KEEP", "핵심 Day를 먼저 배치하기"],
      ["KEEP", "오전 일정 밀도 유지"],
      ["PROBLEM", "저녁 일정이 과밀했어요"],
      ["TRY", "저녁에는 Day를 하루 1개만 배치하기"],
    ]);
    expect(save).not.toHaveBeenCalled();
  });

  it("asks first when saved lines, drafts or typed text exist", async () => {
    for (const [saved, typing] of [[review([item({})]), false], [null, true]] as const) {
      const { flow } = await withDraft();
      flow.applyDraft(saved, typing);
      expect(flow.getState().conflict).toBe(true);
      expect(flow.getState().drafts).toEqual([]);
    }
  });

  it("append keeps saved lines and adds drafts without duplicates", async () => {
    const { flow } = await withDraft();
    const saved = review([item({ id: "k1", content: "핵심 Day를 먼저 배치하기" })]);

    flow.applyDraft(saved, false);
    flow.resolveConflict("append", saved);

    expect(flow.getState().drafts.map((line) => line.content)).toEqual([
      "오전 일정 밀도 유지",
      "저녁 일정이 과밀했어요",
      "저녁에는 Day를 하루 1개만 배치하기",
    ]);
    expect(flow.getState().replacingIds).toEqual([]);
  });

  it("replace only marks saved lines; linked lines are always kept", async () => {
    const { flow } = await withDraft();
    const saved = review([
      item({ id: "plain", content: "직접 쓴 Keep" }),
      item({ id: "day", kind: "TRY", content: "Day로 만든 Try", convertedDayId: "d1" }),
      item({ id: "goal", kind: "PROBLEM", content: "목표에 연결", goalId: "g1" }),
    ]);

    flow.applyDraft(saved, false);
    flow.resolveConflict("replace", saved);

    expect(flow.getState().drafts).toHaveLength(4);
    expect(replacedCount(saved, flow.getState().replacingIds)).toBe(1);
  });

  it("cancel changes nothing", async () => {
    const { flow } = await withDraft();
    const saved = review([item({})]);
    flow.applyDraft(saved, false);
    flow.resolveConflict("cancel", saved);
    expect(flow.getState()).toMatchObject({ conflict: false, drafts: [], replacingIds: [] });
  });

  it("lets the user edit and remove draft lines", async () => {
    const { flow } = await withDraft();
    flow.applyDraft(null, false);
    const [first, second] = flow.getState().drafts;
    flow.editDraft(first!.key, "핵심 Day를 오전에 먼저 배치하기");
    flow.removeDraft(second!.key);
    expect(flow.getState().drafts.map((line) => line.content)).toEqual([
      "핵심 Day를 오전에 먼저 배치하기",
      "저녁 일정이 과밀했어요",
      "저녁에는 Day를 하루 1개만 배치하기",
    ]);
    flow.discardDrafts();
    expect(flow.getState().drafts).toEqual([]);
  });
});

describe("Saving drafts", () => {
  it("saves only on explicit save, through the review PUT body", async () => {
    const { flow } = await withDraft();
    const saved = review([item({ id: "k1", content: "직접 쓴 Keep", goalId: null })]);
    const save = vi.fn(async (request: SaveReviewRequest) => review([item({ id: "k1" }), ...request.items.map(() => item({ id: "new" }))]));

    flow.applyDraft(saved, false);
    flow.resolveConflict("append", saved);
    expect(save).not.toHaveBeenCalled();

    await flow.saveDrafts(saved, save);

    expect(save).toHaveBeenCalledTimes(1);
    const request = save.mock.calls[0]![0];
    expect(request.expectedVersion).toBe(2);
    expect(request.rating).toBe(4);
    expect(request.items[0]).toMatchObject({ id: "k1", content: "직접 쓴 Keep" });
    expect(request.items.slice(1).map((line) => [line.kind, line.content, line.id, line.goalId, line.targetGoalId])).toEqual([
      ["KEEP", "핵심 Day를 먼저 배치하기", null, null, null],
      ["KEEP", "오전 일정 밀도 유지", null, null, null],
      ["PROBLEM", "저녁 일정이 과밀했어요", null, null, null],
      ["TRY", "저녁에는 Day를 하루 1개만 배치하기", null, null, null],
    ]);
    expect(flow.getState()).toMatchObject({ drafts: [], replacingIds: [], saving: false });
  });

  it("replace removes unlinked saved lines only when saving", async () => {
    const saved = review([
      item({ id: "plain" }),
      item({ id: "linked", kind: "TRY", content: "Day로 만든 Try", convertedDayId: "d1" }),
    ]);
    const request = draftSaveRequest(saved, draftLinesFrom(draft), ["plain", "linked"]);
    expect(request.items.map((line) => line.id)).toEqual(["linked", null, null, null, null]);
  });

  it("keeps the drafts when saving fails", async () => {
    const { flow } = await withDraft();
    flow.applyDraft(null, false);
    const failure = problem(409, "VERSION_CONFLICT");
    await flow.saveDrafts(null, vi.fn(async () => Promise.reject(failure)));
    expect(flow.getState().drafts).toHaveLength(4);
    expect(flow.getState().saveError).toBe(failure);
  });

  it("skips empty edited lines", () => {
    const lines = draftLinesFrom(draft);
    lines[0]!.content = "   ";
    expect(draftSaveRequest(null, lines, []).items).toHaveLength(3);
    expect(draftSaveRequest(null, lines, []).expectedVersion).toBeNull();
  });
});
