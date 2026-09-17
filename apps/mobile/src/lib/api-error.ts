import type { FieldViolation, ProblemResponse } from "@dayflow/api-client";

/** A non-2xx response from the DayFlow API. `problem` is the Problem Details body when present. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemResponse | undefined;

  constructor(status: number, problem: ProblemResponse | undefined) {
    super(problem?.detail ?? `API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

function isProblemResponse(value: unknown): value is ProblemResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Record<keyof ProblemResponse, unknown>>;
  return typeof candidate.code === "string" && typeof candidate.status === "number";
}

type ApiResult<Data> = { data?: Data; error?: unknown; response: Response };

export async function expectData<Data>(call: Promise<ApiResult<Data>>): Promise<Data> {
  const { data, error, response } = await call;
  if (error !== undefined || !response.ok || data === undefined) {
    throw new ApiError(response.status, isProblemResponse(error) ? error : undefined);
  }
  return data;
}

export async function expectNoContent(call: Promise<ApiResult<unknown>>): Promise<void> {
  const { error, response } = await call;
  if (error !== undefined || !response.ok) {
    throw new ApiError(response.status, isProblemResponse(error) ? error : undefined);
  }
}

/** 409 (version conflict) or 404 (already removed): cached data is stale and must be refetched. */
export function isStaleDataError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 404);
}

const ERROR_HINTS: Partial<Record<string, string>> = {
  VALIDATION_ERROR: "입력값을 확인해주세요.",
  VERSION_CONFLICT: "다른 곳에서 먼저 변경되었어요. 최신 상태를 불러왔으니 다시 시도해주세요.",
  SCHEDULE_VERSION_CONFLICT: "다른 곳에서 일정이 변경되었어요. 최신 상태를 불러왔어요.",
  DAY_REQUIRES_WEEK_GOAL: "Day는 주간 목표나 기간 목표에만 연결할 수 있어요.",
  DATE_OUTSIDE_WEEK_GOAL_PERIOD: "실행 날짜는 연결된 주간 목표 기간 안이어야 해요.",
  DATE_OUTSIDE_GOAL_PERIOD: "날짜는 연결된 기간 목표의 시작일과 종료일 사이여야 해요. 기간 안의 날짜를 고르거나 목표 연결을 해제해주세요.",
  GOAL_IN_USE: "연결된 Day나 하위 목표가 남아 있어 삭제할 수 없어요.",
  REVIEW_ITEM_NOT_TRY: "Try 항목만 Day로 만들 수 있어요.",
  INVALID_RECOVERY_DECISION: "정리 방법을 다시 확인해주세요.",
  INVALID_RECOVERY_RETURN_DATE: "돌아올 날은 Recovery Day 다음 날 이후여야 해요.",
  INVALID_EVENT_TIME: "일정 시간을 확인해주세요. 종료는 시작보다 빠를 수 없어요.",
  INVALID_EVENT_REMINDERS: "알림은 서로 다른 시간으로 최대 5개까지 설정할 수 있어요.",
  INVALID_EVENT_GOAL: "연결할 목표를 찾을 수 없어요.",
  INVALID_EVENT_CATEGORY: "카테고리를 찾을 수 없어요. 다시 선택해주세요.",
  EVENT_NOT_FOUND: "일정을 찾을 수 없어요. 이미 삭제되었을 수 있어요.",
  DAY_NOT_FOUND: "Day를 찾을 수 없어요. 이미 삭제되었을 수 있어요.",
  GOAL_NOT_FOUND: "목표를 찾을 수 없어요. 이미 삭제되었을 수 있어요.",
  AI_COACH_UNAVAILABLE: "AI 코치가 아직 연결되지 않았어요.",
  AI_RATE_LIMITED: "AI 코치를 잠시 많이 사용했어요. 잠시 후 다시 시도해 주세요.",
  AI_COACH_FAILED: "지금은 코치의 답변을 불러오지 못했어요.",
  AI_COACH_BUSY: "이미 코치 답변을 준비하고 있어요.",
};

/** One user-facing sentence for any error a query or mutation can throw. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const { problem } = error;
    if (!problem) return `요청이 실패했어요. (HTTP ${error.status})`;
    const hint = ERROR_HINTS[problem.code];
    // Conflicts, and the Goal period rule whose hint already says everything, show only the Korean hint.
    if (hint && (error.status === 409 || problem.code === "DATE_OUTSIDE_GOAL_PERIOD")) return hint;
    const fields = (problem.fieldErrors ?? []).map((violation: FieldViolation) => `${violation.field}: ${violation.message}`);
    return [hint ?? problem.detail, ...fields].join("\n");
  }
  // fetch rejects with TypeError when the API is unreachable (server down, wrong URL, other network).
  if (error instanceof TypeError) {
    return "API 서버에 연결할 수 없어요. 서버가 실행 중인지, 휴대폰과 같은 네트워크인지, EXPO_PUBLIC_DAYFLOW_API_BASE_URL이 맞는지 확인해주세요.";
  }
  if (error instanceof Error) return error.message;
  return "알 수 없는 오류가 발생했어요.";
}