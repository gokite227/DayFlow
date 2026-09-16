import { codeChallengeOf, parseAuthCallback, type MeResponse } from "@dayflow/api-client";
import { describe, expect, it, vi } from "vitest";
import { routeForPayload } from "../notifications/notification-payload";
import { createMobileAuthSession, MOBILE_REDIRECT_URI, MobileLoginError, type AuthSessionResult, type SecretStore } from "./mobile-auth-session";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const API = "http://192.168.0.10:8080";
const CODE = "M".repeat(43);
const crypto = {
  randomBytes: (length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
  sha256: async (data: Uint8Array<ArrayBuffer>) => new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data)),
};

const me = (id: string): MeResponse => ({ id, email: `${id}@example.com`, displayName: id, avatarUrl: null });

function memoryStore(initial: string | null = null): SecretStore & { value: string | null } {
  const store = {
    value: initial,
    get: async () => store.value,
    set: async (value: string) => void (store.value = value),
    clear: async () => void (store.value = null),
  };
  return store;
}

/** Fake DayFlow API for MOBILE: refresh tokens travel in the body and rotate on every refresh. */
function fakeApi(options: { validRefresh?: string[]; offline?: boolean } = {}) {
  const refreshTokens = new Map<string, string>((options.validRefresh ?? []).map((token) => [token, "user-a"]));
  const accessTokens = new Map<string, string>();
  const calls: { path: string; authorization: string | null; body: string }[] = [];
  let counter = 0;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const issue = (userId: string, withRefresh = true) => {
    counter += 1;
    accessTokens.set(`access-${counter}`, userId);
    const refreshToken = withRefresh ? `refresh-${counter}` : null;
    if (refreshToken) refreshTokens.set(refreshToken, userId);
    return { accessToken: `access-${counter}`, tokenType: "Bearer", expiresIn: 900, refreshToken, returnTo: null };
  };

  const fetch = vi.fn(async (request: Request) => {
    if (options.offline) throw new TypeError("Network request failed");
    const path = new URL(request.url).pathname;
    const body = await request.text();
    calls.push({ path, authorization: request.headers.get("Authorization"), body });
    if (path === "/api/v1/auth/refresh") {
      const token = (JSON.parse(body) as { refreshToken: string }).refreshToken;
      const userId = refreshTokens.get(token);
      if (!userId) return json(401, { code: "INVALID_REFRESH_TOKEN", status: 401 });
      refreshTokens.delete(token);
      return json(200, issue(userId));
    }
    if (path === "/api/v1/auth/exchange") {
      const parsed = JSON.parse(body) as { code: string; platform: string };
      return parsed.code === CODE && parsed.platform === "MOBILE" ? json(200, issue("user-b")) : json(400, { code: "INVALID_AUTH_CODE", status: 400 });
    }
    if (path === "/api/v1/auth/logout") {
      refreshTokens.delete((JSON.parse(body) as { refreshToken: string }).refreshToken);
      return new Response(null, { status: 204 });
    }
    const userId = accessTokens.get(request.headers.get("Authorization")?.replace("Bearer ", "") ?? "");
    if (!userId) return json(401, { code: "UNAUTHORIZED", status: 401 });
    return path === "/api/v1/me" ? json(200, me(userId)) : json(200, []);
  });
  return { fetch, calls, expireAccessTokens: () => accessTokens.clear(), refreshTokens };
}

function setup(api: ReturnType<typeof fakeApi>, storedRefresh: string | null = null, authResult?: (url: string) => AuthSessionResult) {
  const refreshTokenStore = memoryStore(storedRefresh);
  const verifierStore = memoryStore();
  const onUserChanged = vi.fn();
  const onSignedOut = vi.fn();
  const openAuthSession = vi.fn(async (url: string, redirectUri: string) => {
    expect(redirectUri).toBe(MOBILE_REDIRECT_URI);
    return authResult ? authResult(url) : ({ type: "success", url: `${MOBILE_REDIRECT_URI}?code=${CODE}` } as AuthSessionResult);
  });
  const session = createMobileAuthSession({
    apiBaseUrl: API,
    fetch: api.fetch,
    refreshTokenStore,
    verifierStore,
    crypto,
    openAuthSession,
    redirectUri: MOBILE_REDIRECT_URI,
    onUserChanged,
    onSignedOut,
  });
  return { session, refreshTokenStore, verifierStore, onUserChanged, onSignedOut, openAuthSession };
}

describe("Mobile auth session", () => {
  it("shows the login on first start (no refresh token in secure storage)", async () => {
    const api = fakeApi();
    const { session } = setup(api);
    await session.bootstrap();
    expect(session.getState()).toEqual({ status: "signedOut", message: null });
    expect(api.calls).toHaveLength(0);
  });

  it("restores the session: secure token → refresh (rotated and saved) → /me", async () => {
    const api = fakeApi({ validRefresh: ["stored"] });
    const { session, refreshTokenStore, onUserChanged } = setup(api, "stored");
    await session.bootstrap();

    expect(session.getState()).toEqual({ status: "signedIn", user: me("user-a") });
    expect(refreshTokenStore.value).toMatch(/^refresh-/);
    expect(api.refreshTokens.has("stored")).toBe(false);
    expect(JSON.parse(api.calls[0]!.body)).toEqual({ refreshToken: "stored" });
    expect(api.calls[0]!.authorization).toBeNull();
    expect(onUserChanged).toHaveBeenCalledTimes(1);
  });

  it("deletes a revoked token and shows the login, but keeps it when the API is unreachable", async () => {
    const revoked = setup(fakeApi(), "revoked");
    await revoked.session.bootstrap();
    expect(revoked.session.getState().status).toBe("signedOut");
    expect(revoked.refreshTokenStore.value).toBeNull();

    const offline = setup(fakeApi({ offline: true }), "kept");
    await offline.session.bootstrap();
    expect(offline.session.getState()).toEqual({ status: "offline" });
    expect(offline.refreshTokenStore.value).toBe("kept");
  });

  it("signs in with Google through the system browser using PKCE and stores only the refresh token", async () => {
    const api = fakeApi();
    let startUrl = "";
    const { session, refreshTokenStore, verifierStore, openAuthSession } = setup(api, null, (url) => {
      startUrl = url;
      return { type: "success", url: `${MOBILE_REDIRECT_URI}?code=${CODE}` };
    });
    await session.bootstrap();
    await session.signInWithGoogle();

    const start = new URL(startUrl);
    expect(start.origin + start.pathname).toBe(`${API}/api/v1/auth/google/start`);
    expect(start.searchParams.get("platform")).toBe("MOBILE");
    const exchange = api.calls.find((call) => call.path === "/api/v1/auth/exchange")!;
    const body = JSON.parse(exchange.body) as { code: string; codeVerifier: string; platform: string };
    expect(body.code).toBe(CODE);
    expect(body.platform).toBe("MOBILE");
    expect(start.searchParams.get("codeChallenge")).toBe(await codeChallengeOf(body.codeVerifier, crypto));
    expect(startUrl).not.toContain(body.codeVerifier);

    expect(openAuthSession).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({ status: "signedIn", user: me("user-b") });
    expect(refreshTokenStore.value).toMatch(/^refresh-/);
    expect(verifierStore.value).toBeNull();
  });

  it("stays on the login when the browser is cancelled, and completes a callback only once", async () => {
    const cancelled = setup(fakeApi(), null, () => ({ type: "cancel" }));
    await cancelled.session.bootstrap();
    await cancelled.session.signInWithGoogle();
    expect(cancelled.session.getState()).toEqual({ status: "signedOut", message: null });

    // Android: the redirect reaches both the auth session and the auth/callback route.
    const api = fakeApi();
    const { session, verifierStore } = setup(api);
    await verifierStore.set("v".repeat(43));
    const url = `${MOBILE_REDIRECT_URI}?code=${CODE}`;
    await Promise.all([session.completeLogin(url), session.completeLogin(url)]);
    expect(api.calls.filter((call) => call.path === "/api/v1/auth/exchange")).toHaveLength(1);
    expect(session.getState().status).toBe("signedIn");

    await expect(setup(fakeApi()).session.completeLogin(url)).rejects.toEqual(new MobileLoginError("login_expired"));
    await expect(session.completeLogin(`${MOBILE_REDIRECT_URI}?error=google_login_failed`)).rejects.toMatchObject({
      reason: "google_login_failed",
    });
  });

  it("refreshes once for concurrent 401s and saves the rotated token", async () => {
    const api = fakeApi({ validRefresh: ["stored"] });
    const { session, refreshTokenStore } = setup(api, "stored");
    await session.bootstrap();
    const beforeExpiry = refreshTokenStore.value;
    api.expireAccessTokens();

    const results = await Promise.all(["/api/v1/goals", "/api/v1/days", "/api/v1/events"].map((path) => session.api.GET(path as "/api/v1/goals")));
    expect(results.map(({ response }) => response.status)).toEqual([200, 200, 200]);
    expect(api.calls.filter((call) => call.path === "/api/v1/auth/refresh")).toHaveLength(2);
    expect(refreshTokenStore.value).not.toBe(beforeExpiry);
    expect(api.refreshTokens.has(refreshTokenStore.value!)).toBe(true);
  });

  it("logs out: server revoke, secure token deleted, caches and device data cleared", async () => {
    const api = fakeApi({ validRefresh: ["stored"] });
    const { session, refreshTokenStore, onUserChanged, onSignedOut } = setup(api, "stored");
    await session.bootstrap();
    const token = refreshTokenStore.value!;
    await session.logout();

    expect(JSON.parse(api.calls.find((call) => call.path === "/api/v1/auth/logout")!.body)).toEqual({ refreshToken: token });
    expect(api.refreshTokens.has(token)).toBe(false);
    expect(refreshTokenStore.value).toBeNull();
    expect(session.getState()).toEqual({ status: "signedOut", message: null });
    expect(onUserChanged).toHaveBeenCalledTimes(2);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it("ends the session when the refresh token was revoked elsewhere", async () => {
    const api = fakeApi({ validRefresh: ["stored"] });
    const { session, refreshTokenStore, onSignedOut } = setup(api, "stored");
    await session.bootstrap();
    api.expireAccessTokens();
    api.refreshTokens.clear();

    const { response } = await session.api.GET("/api/v1/goals");
    expect(response.status).toBe(401);
    await vi.waitFor(() => expect(session.getState().status).toBe("signedOut"));
    expect(refreshTokenStore.value).toBeNull();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });
});

describe("login deep link", () => {
  it("uses dayflow://auth/callback, separate from notification Event links", () => {
    expect(parseAuthCallback(`dayflow://auth/callback?code=${CODE}`)).toEqual({ kind: "code", code: CODE });
    expect(routeForPayload({ eventId: "0b6f7a52-51e4-4f4b-9d8e-6c1f1b0c1a11" })?.pathname).toBe("/events/[eventId]");

    const routes = Object.keys(import.meta.glob("../../../app/**/*.tsx")).map((file) => file.replace("../../../app/", ""));
    expect(routes).toContain("auth/callback.tsx");
    expect(routes).toContain("login.tsx");
    expect(routes).toContain("events/[eventId].tsx");
  });
});
