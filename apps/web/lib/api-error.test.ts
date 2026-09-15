import type { ProblemResponse } from "@dayflow/api-client";
import { describe, expect, it } from "vitest";
import { ApiError, describeApiError, expectData, expectNoContent } from "./api-error";

const problem: ProblemResponse = {
  status: 400,
  title: "Invalid Goal parent",
  detail: "A MONTH Goal must have a QUARTER Goal as its parent.",
  instance: "/api/v1/goals",
  code: "INVALID_GOAL_PARENT",
  fieldErrors: [{ field: "parentGoalId", message: "A MONTH Goal must have a QUARTER Goal as its parent." }],
  traceId: "trace",
};

const response = (status: number) => new Response(null, { status });

describe("expectData", () => {
  it("returns the body of a successful response", async () => {
    await expect(expectData(Promise.resolve({ data: { id: "1" }, response: response(200) }))).resolves.toEqual({
      id: "1",
    });
  });

  it("throws ApiError carrying the ProblemResponse", async () => {
    const result = expectData(Promise.resolve({ error: problem, response: response(400) }));

    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 400, problem });
  });

  it("keeps non-Problem error bodies out of `problem`", async () => {
    await expect(
      expectData(Promise.resolve({ error: "<html>Bad gateway</html>", response: response(502) })),
    ).rejects.toMatchObject({ status: 502, problem: undefined });
  });
});

describe("expectNoContent", () => {
  it("resolves for 204 and rejects for an error response", async () => {
    await expect(expectNoContent(Promise.resolve({ response: response(204) }))).resolves.toBeUndefined();
    await expect(
      expectNoContent(Promise.resolve({ error: { ...problem, status: 409, code: "GOAL_IN_USE" }, response: response(409) })),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("describeApiError", () => {
  it("adds a user hint for known codes and keeps field errors", () => {
    const description = describeApiError(new ApiError(400, problem));

    expect(description.message).toContain("바로 위 단계");
    expect(description.message).toContain(problem.detail);
    expect(description.fieldErrors).toEqual(problem.fieldErrors);
  });

  it("shows only the reload hint for a schedule conflict", () => {
    const conflict = new ApiError(409, {
      ...problem,
      status: 409,
      code: "SCHEDULE_VERSION_CONFLICT",
      fieldErrors: [{ field: "expectedVersion", message: "stale" }],
    });

    expect(describeApiError(conflict)).toEqual({
      message: "다른 곳에서 일정이 변경되었습니다. 최신 상태를 불러왔어요.",
      fieldErrors: [],
    });
  });

  it("explains an unreachable API", () => {
    expect(describeApiError(new TypeError("Failed to fetch")).message).toContain("API 서버에 연결할 수 없습니다");
  });

  it("falls back to the HTTP status without a Problem body", () => {
    expect(describeApiError(new ApiError(500, undefined)).message).toContain("HTTP 500");
  });
});
