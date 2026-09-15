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

/** User-facing hints for error codes a user can fix; the server detail is always kept. */
const ERROR_HINTS: Partial<Record<string, string>> = {
  VALIDATION_ERROR: "입력값을 확인해주세요.",
  INVALID_GOAL_PERIOD: "종료일은 시작일과 같거나 이후여야 합니다.",
  INVALID_GOAL_PARENT: "상위 목표는 바로 위 단계(연간 → 분기 → 월간 → 주간)여야 합니다.",
  GOAL_OUTSIDE_PARENT_PERIOD: "하위 목표 기간은 상위 목표 기간 안에 있어야 합니다.",
  GOAL_IN_USE: "하위 목표나 Day가 남아 있어 삭제할 수 없습니다.",
  DAY_REQUIRES_WEEK_GOAL: "Day는 주간 목표에만 연결할 수 있습니다.",
  DATE_OUTSIDE_WEEK_GOAL_PERIOD: "실행 날짜는 연결된 주간 목표 기간 안이어야 합니다.",
  INVALID_SCHEDULE_RANGE: "종료 시간은 시작 시간보다 뒤여야 합니다.",
  VERSION_CONFLICT: "다른 곳에서 먼저 수정되었습니다. 최신 내용을 불러온 뒤 다시 시도해주세요.",
  SCHEDULE_VERSION_CONFLICT: "일정이 다른 곳에서 먼저 수정되었습니다. 최신 내용을 불러온 뒤 다시 시도해주세요.",
  GOAL_NOT_FOUND: "목표를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.",
  DAY_NOT_FOUND: "Day를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.",
};

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
