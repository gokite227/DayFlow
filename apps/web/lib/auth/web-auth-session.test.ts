import { codeChallengeOf, type MeResponse } from "@dayflow/api-client";
import { describe, expect, it, vi } from "vitest";
import { createWebAuthSession, LoginCallbackError, type KeyValueStorage } from "./web-auth-session";

const API = "http://api.test";
/** The Web origin: the refresh-cookie endpoints are called here and proxied to the API (next.config.ts). */
const WEB = "http://web.test";
const CODE = "C".repeat(43);
const crypto = {
  randomBytes: (length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
  sha256: async (data: Uint8Array<ArrayBuffer>) => new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data)),
};

function user(id: string): MeResponse {
  return { id, email: `${id}@example.com`, displayName: id, avatarUrl: null };
}

/** A tiny fake of the DayFlow API: an HttpOnly-style cookie jar, rotating refresh tokens and protected /me + /goals. */
function fakeApi(initial: { cookieUser?: string | null } = {}) {
  let cookie: { user: string; value: string } | null = initial.cookieUser ? { user: initial.cookieUser, value: "r0" } : null;
  let counter = 0;
  const validAccess = new Map<string, string>();
  const calls: { method: string; origin: string; path: string; authorization: string | null; credentials: RequestCredentials; body: string }[] = [];

  const issue = (userId: string) => {
    counter += 1;
    const token = `access-${userId}-${counter}`;
    validAccess.set(token, userId);
    cookie = { user: userId, value: `r${counter}` };
    return token;
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const fetch = vi.fn(async (request: Request) => {
    const { origin, pathname: path } = new URL(request.url);
    const body = await request.text();
    calls.push({ method: request.method, origin, path, authorization: request.headers.get("Authorization"), credentials: request.credentials, body });
    const bearer = request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    switch (`${request.method} ${path}`) {
      case "POST /api/v1/auth/refresh":
        if (!cookie) return json(401, { code: "INVALID_REFRESH_TOKEN", status: 401 });
        return json(200, { accessToken: issue(cookie.user), tokenType: "Bearer", expiresIn: 900, refreshToken: null, returnTo: null });
      case "POST /api/v1/auth/exchange": {
        const parsed = JSON.parse(body) as { code: string; codeVerifier: string; platform: string };
        if (parsed.code !== CODE) return json(400, { code: "INVALID_AUTH_CODE", status: 400 });
        return json(200, { accessToken: issue("user-b"), tokenType: "Bearer", expiresIn: 900, refreshToken: null, returnTo: "/calendar" });
      }
      case "POST /api/v1/auth/logout":
        cookie = null;
        return new Response(null, { status: 204 });
      case "GET /api/v1/me":
      case "GET /api/v1/goals": {
        const userId = validAccess.get(bearer);
        if (!userId) return json(401, { code: "UNAUTHORIZED", status: 401 });
        return path === "/api/v1/me" ? json(200, user(userId)) : json(200, []);
      }
      default:
        return json(404, {});
    }
  });

  return {
    fetch,
    calls,
    expireAccessTokens: () => validAccess.clear(),
    dropCookie: () => (cookie = null),
    cookieUser: () => cookie?.user ?? null,
  };
}

function memoryStorage(): KeyValueStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

function setup(api = fakeApi()) {
  const storage = memoryStorage();
  const navigate = vi.fn();
  const onUserChanged = vi.fn();
  const session = createWebAuthSession({ apiBaseUrl: API, authBaseUrl: WEB, fetch: api.fetch, storage, crypto, navigate, onUserChanged, retryDelayMs: 1 });
  return { api, storage, navigate, onUserChanged, session };
}

describe("Web auth session", () => {
  it("restores a session on reload: refresh cookie → access token in memory → /me", async () => {
    const { api, session, onUserChanged } = setup(fakeApi({ cookieUser: "user-a" }));
    await session.bootstrap();

    expect(session.getState()).toEqual({ status: "signedIn", user: user("user-a") });
    expect(onUserChanged).toHaveBeenCalledTimes(1);
    const refresh = api.calls.find((call) => call.path === "/api/v1/auth/refresh")!;
    expect(refresh.credentials).toBe("include");
    expect(refresh.authorization).toBeNull();
    expect(api.calls.find((call) => call.path === "/api/v1/me")!.authorization).toMatch(/^Bearer access-user-a-/);
  });

  it("calls the refresh-cookie endpoints on the Web origin (first-party cookie) and everything else on the API", async () => {
    const { api, session, navigate, storage } = setup(fakeApi({ cookieUser: "user-a" }));
    await session.bootstrap();
    await session.api.GET("/api/v1/goals");
    await session.logout();
    storage.setItem("dayflow.auth.pkceVerifier", "v".repeat(43));
    await session.completeLogin(`${WEB}/auth/callback?code=${CODE}`);
    await session.startGoogleLogin(null);

    for (const call of api.calls) {
      const cookieEndpoint = /^\/api\/v1\/auth\/(exchange|refresh|logout)$/.test(call.path);
      expect(call.origin, call.path).toBe(cookieEndpoint ? WEB : API);
    }
    expect(api.calls.map((call) => call.path)).toEqual(
      expect.arrayContaining(["/api/v1/auth/refresh", "/api/v1/me", "/api/v1/goals", "/api/v1/auth/logout", "/api/v1/auth/exchange"]),
    );
    // Google login starts on the API origin, where the Google callback returns.
    expect(new URL(navigate.mock.calls[0]![0] as string).origin).toBe(API);
  });

  it("shows the login when there is no valid refresh cookie", async () => {
    const { api, session } = setup();
    await session.bootstrap();

    expect(session.getState()).toEqual({ status: "signedOut", message: null });
    // One retry for a refresh racing in another tab, never /me.
    expect(api.calls.map((call) => call.path)).toEqual(["/api/v1/auth/refresh", "/api/v1/auth/refresh"]);
  });

  it("starts Google login with a PKCE challenge and keeps the verifier and route in sessionStorage", async () => {
    const { session, storage, navigate } = setup();
    await session.startGoogleLogin("/goals/42");

    const verifier = storage.values.get("dayflow.auth.pkceVerifier")!;
    expect(verifier).toHaveLength(43);
    expect(storage.values.get("dayflow.auth.returnTo")).toBe("/goals/42");
    const url = new URL(navigate.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/api/v1/auth/google/start");
    expect(url.searchParams.get("platform")).toBe("WEB");
    expect(url.searchParams.get("codeChallengeMethod")).toBe("S256");
    expect(url.searchParams.get("codeChallenge")).toBe(await codeChallengeOf(verifier, crypto));
    expect(url.search).not.toContain(verifier);

    await session.startGoogleLogin("https://evil.example");
    expect(storage.values.get("dayflow.auth.returnTo")).toBe("/today");
  });

  it("completes the callback once: exchange with the verifier, load the user, return the saved route", async () => {
    const { api, session, storage, onUserChanged } = setup();
    storage.setItem("dayflow.auth.pkceVerifier", "v".repeat(43));
    storage.setItem("dayflow.auth.returnTo", "/goals/42");

    const url = `http://web.test/auth/callback?code=${CODE}`;
    const [first, second] = await Promise.all([session.completeLogin(url), session.completeLogin(url)]);

    expect(first).toBe("/goals/42");
    expect(second).toBe("/goals/42");
    expect(session.getState()).toEqual({ status: "signedIn", user: user("user-b") });
    expect(onUserChanged).toHaveBeenCalledTimes(1);
    const exchanges = api.calls.filter((call) => call.path === "/api/v1/auth/exchange");
    expect(exchanges).toHaveLength(1);
    expect(JSON.parse(exchanges[0]!.body)).toEqual({ code: CODE, codeVerifier: "v".repeat(43), platform: "WEB" });
    expect(exchanges[0]!.credentials).toBe("include");
    expect(storage.values.size).toBe(0);
  });

  it("rejects callbacks without a verifier or with an error", async () => {
    const { session } = setup();
    await expect(session.completeLogin(`http://web.test/auth/callback?code=${CODE}`)).rejects.toEqual(new LoginCallbackError("login_expired"));
    await expect(session.completeLogin("http://web.test/auth/callback?error=google_login_failed")).rejects.toMatchObject({
      reason: "google_login_failed",
    });
  });

  it("refreshes an expired access token once for concurrent requests and retries them", async () => {
    const { api, session } = setup(fakeApi({ cookieUser: "user-a" }));
    await session.bootstrap();
    api.expireAccessTokens();

    const results = await Promise.all([1, 2, 3].map(() => session.api.GET("/api/v1/goals")));
    expect(results.map(({ response }) => response.status)).toEqual([200, 200, 200]);
    expect(api.calls.filter((call) => call.path === "/api/v1/auth/refresh")).toHaveLength(2);
    expect(session.getState().status).toBe("signedIn");
  });

  it("signs out when the refresh fails during an API call", async () => {
    const { api, session, onUserChanged } = setup(fakeApi({ cookieUser: "user-a" }));
    await session.bootstrap();
    api.expireAccessTokens();
    api.dropCookie();

    const { response } = await session.api.GET("/api/v1/goals");
    expect(response.status).toBe(401);
    expect(session.getState()).toEqual({ status: "signedOut", message: "로그인이 만료되었어요. 다시 로그인해주세요." });
    expect(onUserChanged).toHaveBeenCalledTimes(2);
  });

  it("logs out on the server, forgets the access token and clears caches", async () => {
    const { api, session, onUserChanged } = setup(fakeApi({ cookieUser: "user-a" }));
    await session.bootstrap();
    await session.logout();

    expect(api.cookieUser()).toBeNull();
    expect(session.getState()).toEqual({ status: "signedOut", message: null });
    expect(onUserChanged).toHaveBeenCalledTimes(2);
    const logout = api.calls.find((call) => call.path === "/api/v1/auth/logout")!;
    expect(logout.credentials).toBe("include");

    api.calls.length = 0;
    await session.api.GET("/api/v1/goals");
    expect(api.calls[0]!.authorization).toBeNull();
  });
});
