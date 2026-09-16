/** WEB keeps its refresh token in a cookie, MOBILE in secure storage (same values as the API). */
export type AuthPlatform = "WEB" | "MOBILE";

export interface LoginStart {
  apiBaseUrl: string;
  platform: AuthPlatform;
  codeChallenge: string;
  /** App route to come back to after the login. */
  returnTo?: string | null;
}

/** The browser URL that starts Google login on the DayFlow API (never called with fetch). */
export function googleLoginStartUrl(start: LoginStart): string {
  const query = new URLSearchParams({
    platform: start.platform,
    codeChallenge: start.codeChallenge,
    codeChallengeMethod: "S256",
  });
  const returnTo = safeReturnTo(start.returnTo ?? null);
  if (returnTo !== null) query.set("returnTo", returnTo);
  return `${start.apiBaseUrl.replace(/\/+$/, "")}/api/v1/auth/google/start?${query.toString()}`;
}

export type AuthCallback = { kind: "code"; code: string } | { kind: "error"; error: string } | { kind: "invalid" };

/** Reads `?code=` or `?error=` of a login callback URL (Web page or `dayflow://auth/callback`). */
export function parseAuthCallback(url: string): AuthCallback {
  const queryStart = url.indexOf("?");
  if (queryStart < 0) return { kind: "invalid" };
  const hashStart = url.indexOf("#", queryStart);
  const query = new URLSearchParams(url.slice(queryStart + 1, hashStart < 0 ? undefined : hashStart));
  const error = query.get("error");
  if (error) return { kind: "error", error };
  const code = query.get("code");
  if (code && /^[A-Za-z0-9_-]{16,100}$/.test(code)) return { kind: "code", code };
  return { kind: "invalid" };
}

/**
 * Only in-app routes ("/goals/1"), never another origin ("//evil", "https://…", "/\evil"). Anything else is
 * null so the caller uses its default screen.
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  const route = value.trim();
  if (!/^\/(?![/\\])[^\s\\]{0,499}$/.test(route)) return null;
  if (route.startsWith("/auth/")) return null;
  return route;
}

/** User-facing message for a callback error key sent by the API. */
export function describeLoginError(error: string): string {
  switch (error) {
    case "account_not_verified":
      return "이메일이 확인된 Google 계정으로만 로그인할 수 있어요.";
    case "login_expired":
      return "로그인 시간이 지났어요. 다시 시도해주세요.";
    case "google_login_failed":
      return "Google 로그인을 완료하지 못했어요. 다시 시도해주세요.";
    default:
      return "로그인을 완료하지 못했어요. 다시 시도해주세요.";
  }
}
