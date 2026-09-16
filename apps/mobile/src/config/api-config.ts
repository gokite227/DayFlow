/**
 * The API origin comes only from EXPO_PUBLIC_DAYFLOW_API_BASE_URL. Nothing falls back to a hard-coded
 * host: on a phone "localhost" is the phone itself, so a silent default would only hide the problem.
 */
export type ApiConfig =
  | { ok: true; baseUrl: string; /** localhost/127.0.0.1: works on simulators only. */ loopback: boolean }
  | { ok: false; reason: "missing" | "invalid"; raw: string };

const URL_PATTERN = /^(https?):\/\/([^/:?#\s]+)(:\d{1,5})?(\/[^?#\s]*)?$/i;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function resolveApiConfig(raw: string | undefined): ApiConfig {
  const value = (raw ?? "").trim();
  if (value === "") return { ok: false, reason: "missing", raw: value };
  const match = URL_PATTERN.exec(value);
  if (!match) return { ok: false, reason: "invalid", raw: value };
  const host = (match[2] ?? "").toLowerCase();
  const baseUrl = value.replace(/\/+$/, "");
  return { ok: true, baseUrl, loopback: LOOPBACK_HOSTS.has(host) };
}

export const API_BASE_URL_ENV = "EXPO_PUBLIC_DAYFLOW_API_BASE_URL";

/** Development help shown when the app cannot start its API client. */
export function describeApiConfigProblem(config: Extract<ApiConfig, { ok: false }>): string {
  return config.reason === "missing"
    ? `${API_BASE_URL_ENV}가 설정되지 않았어요. apps/mobile/.env.local에 API 주소를 넣고 개발 서버를 다시 시작해주세요.`
    : `${API_BASE_URL_ENV} 값 "${config.raw}"이 올바른 http(s) 주소가 아니에요. 예: http://192.168.0.10:8080`;
}