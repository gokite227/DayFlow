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

export function isProblemResponse(value: unknown): value is ProblemResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Record<keyof ProblemResponse, unknown>>;
  return typeof candidate.code === "string" && typeof candidate.status === "number";
}

/** The `{ data, error, response }` result of an openapi-fetch call. */
type ApiResult<Data> = { data?: Data; error?: unknown; response: Response };

/** Returns the response body, or throws ApiError for any error response. */
export async function expectData<Data>(call: Promise<ApiResult<Data>>): Promise<Data> {
  const { data, error, response } = await call;
  if (error !== undefined || !response.ok || data === undefined) {
    throw new ApiError(response.status, isProblemResponse(error) ? error : undefined);
  }
  return data;
}

/** For 204 responses: resolves when the request succeeded, otherwise throws ApiError. */
export async function expectNoContent(call: Promise<ApiResult<unknown>>): Promise<void> {
  const { error, response } = await call;
  if (error !== undefined || !response.ok) {
    throw new ApiError(response.status, isProblemResponse(error) ? error : undefined);
  }
}

/** 409 (version conflict) or 404 (already removed): the cached data is stale and must be refetched. */
export function isStaleDataError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 409 || error.status === 404);
}

/** User-facing hints for error codes a user can fix; the server detail is always kept. */
const ERROR_HINTS: Partial<Record<string, string>> = {
  VALIDATION_ERROR: "입력값을 확인해주세요.",
  INVALID_GOAL_PERIOD: "종료일은 시작일과 같거나 이후여야 합니다.",
  INVALID_GOAL_PARENT: "상위 목표는 바로 위 단계(연간 → 분기 → 월간 → 주간)여야 합니다.",
  GOAL_OUTSIDE_PARENT_PERIOD: "하위 목표 기간은 상위 목표 기간 안에 있어야 합니다.",
  GOAL_IN_USE: "하위 목표나 Day가 남아 있어 삭제할 수 없습니다.",
  DAY_REQUIRES_WEEK_GOAL: "Day는 주간 목표나 기간 목표에만 연결할 수 있습니다.",
  DATE_OUTSIDE_WEEK_GOAL_PERIOD: "실행 날짜는 연결된 주간 목표 기간 안이어야 합니다.",
  DATE_OUTSIDE_GOAL_PERIOD: "날짜는 연결된 기간 목표의 시작일과 종료일 사이여야 해요. 기간 안의 날짜를 고르거나 목표 연결을 해제해주세요.",
  INVALID_SCHEDULE_RANGE: "종료 시간은 시작 시간보다 뒤여야 합니다.",
  VERSION_CONFLICT: "다른 곳에서 먼저 변경되었습니다. 최신 상태를 불러온 뒤 다시 시도해주세요.",
  SCHEDULE_VERSION_CONFLICT: "다른 곳에서 일정이 변경되었습니다. 최신 상태를 불러왔어요.",
  INVALID_REVIEW_PERIOD: "회고 기간의 시작일이 올바르지 않습니다.",
  REVIEW_ITEM_NOT_TRY: "Try 항목만 다음 계획으로 옮길 수 있어요.",
  REVIEW_ITEM_NOT_FOUND: "회고 항목을 찾을 수 없습니다. 최신 회고를 불러와 주세요.",
  INVALID_RECOVERY_DECISION: "정리 방법을 다시 확인해주세요.",
  INVALID_RECOVERY_RETURN_DATE: "다시 시작할 날짜는 회복일 다음 날 이후여야 합니다.",
  GOAL_NOT_FOUND: "목표를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.",
  DAY_NOT_FOUND: "Day를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.",
  INVALID_EVENT_TIME: "일정 시간을 확인해주세요. 종료는 시작보다 빠를 수 없습니다.",
  INVALID_EVENT_REMINDERS: "알림은 서로 다른 시간으로 최대 5개까지 설정할 수 있어요.",
  INVALID_EVENT_GOAL: "연결할 목표를 찾을 수 없습니다. 목표를 다시 선택해주세요.",
  INVALID_OCCURRENCE_RANGE: "조회 기간이 너무 깁니다.",
  EVENT_NOT_FOUND: "일정을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.",
  AI_COACH_UNAVAILABLE: "AI 코치가 아직 연결되지 않았어요.",
  AI_RATE_LIMITED: "AI 코치를 잠시 많이 사용했어요. 잠시 후 다시 시도해 주세요.",
  AI_COACH_FAILED: "지금은 코치의 답변을 불러오지 못했어요.",
  AI_COACH_BUSY: "이미 코치 답변을 준비하고 있어요.",
};

const HINT_ONLY_CODES = new Set(["DATE_OUTSIDE_GOAL_PERIOD"]);

export interface ErrorDescription {
  message: string;
  fieldErrors: FieldViolation[];
}

export function describeApiError(error: unknown): ErrorDescription {
  if (error instanceof ApiError) {
    const { problem } = error;
    if (!problem) {
      return { message: `요청이 실패했습니다. (HTTP ${error.status})`, fieldErrors: [] };
    }
    const hint = ERROR_HINTS[problem.code];
    // Conflicts are not input mistakes: show only the reload hint, without field errors. A hint that already
    // says everything the user needs (the Goal period rule) also replaces the English server detail.
    if (hint && (error.status === 409 || HINT_ONLY_CODES.has(problem.code))) {
      return { message: hint, fieldErrors: [] };
    }
    return {
      message: hint ? `${hint} (${problem.detail})` : problem.detail,
      fieldErrors: problem.fieldErrors,
    };
  }
  // fetch rejects with TypeError when the API is unreachable (server down, CORS, wrong URL).
  if (error instanceof TypeError) {
    return {
      message: "API 서버에 연결할 수 없습니다. 서버 실행 상태와 NEXT_PUBLIC_DAYFLOW_API_BASE_URL을 확인해주세요.",
      fieldErrors: [],
    };
  }
  if (error instanceof Error) {
    return { message: error.message, fieldErrors: [] };
  }
  return { message: "알 수 없는 오류가 발생했습니다.", fieldErrors: [] };
}
