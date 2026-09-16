import { describe, expect, it, vi } from "vitest";
import {
  base64UrlEncode,
  codeChallengeOf,
  createAuthorizedFetch,
  createPkcePair,
  googleLoginStartUrl,
  isCodeVerifier,
  parseAuthCallback,
  safeReturnTo,
  singleFlight,
} from "../src/auth";

const webCrypto = {
  randomBytes: (length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
  sha256: async (data: Uint8Array<ArrayBuffer>) => new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data)),
};

describe("PKCE", () => {
  it("encodes base64url without padding", () => {
    expect(base64UrlEncode(new Uint8Array([]))).toBe("");
    expect(base64UrlEncode(new TextEncoder().encode("f"))).toBe("Zg");
    expect(base64UrlEncode(new TextEncoder().encode("fo"))).toBe("Zm8");
    expect(base64UrlEncode(new TextEncoder().encode("foo"))).toBe("Zm9v");
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe("-__-");
  });

  it("matches the RFC 7636 S256 example", async () => {
    await expect(codeChallengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", webCrypto)).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("creates a fresh 43-character verifier and its challenge", async () => {
    const first = await createPkcePair(webCrypto);
    const second = await createPkcePair(webCrypto);
    expect(first.verifier).toHaveLength(43);
    expect(isCodeVerifier(first.verifier)).toBe(true);
    expect(first.verifier).not.toBe(second.verifier);
    await expect(codeChallengeOf(first.verifier, webCrypto)).resolves.toBe(first.challenge);
  });
});

describe("login URLs and callbacks", () => {
  it("builds the Google start URL with the challenge only", () => {
    const url = new URL(
      googleLoginStartUrl({ apiBaseUrl: "http://localhost:8080/", platform: "WEB", codeChallenge: "abc", returnTo: "/goals?x=1" }),
    );
    expect(url.origin + url.pathname).toBe("http://localhost:8080/api/v1/auth/google/start");
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => (query[key] = value));
    expect(query).toEqual({
      platform: "WEB",
      codeChallenge: "abc",
      codeChallengeMethod: "S256",
      returnTo: "/goals?x=1",
    });
    expect(googleLoginStartUrl({ apiBaseUrl: "http://api", platform: "MOBILE", codeChallenge: "abc", returnTo: "https://evil" })).not.toContain(
      "returnTo",
    );
  });

  it("parses code and error callbacks for Web and the mobile scheme", () => {
    const code = "A".repeat(43);
    expect(parseAuthCallback(`http://localhost:3000/auth/callback?code=${code}`)).toEqual({ kind: "code", code });
    expect(parseAuthCallback(`dayflow://auth/callback?code=${code}#`)).toEqual({ kind: "code", code });
    expect(parseAuthCallback("dayflow://auth/callback?error=google_login_failed")).toEqual({ kind: "error", error: "google_login_failed" });
    expect(parseAuthCallback("dayflow://auth/callback")).toEqual({ kind: "invalid" });
    expect(parseAuthCallback("dayflow://auth/callback?code=<script>")).toEqual({ kind: "invalid" });
  });

  it("keeps only in-app return routes", () => {
    expect(safeReturnTo("/goals/1")).toBe("/goals/1");
    for (const unsafe of ["https://evil.example", "//evil.example", "/\\evil", "goals", "/auth/callback", "", null, undefined]) {
      expect(safeReturnTo(unsafe)).toBeNull();
    }
  });
});

describe("single-flight refresh", () => {
  it("shares one running task between concurrent callers and runs again afterwards", async () => {
    let resolve!: (value: string) => void;
    const task = vi.fn(() => new Promise<string>((done) => (resolve = done)));
    const refresh = singleFlight(task);

    const results = Promise.all([refresh(), refresh(), refresh()]);
    resolve("token-1");
    await expect(results).resolves.toEqual(["token-1", "token-1", "token-1"]);
    expect(task).toHaveBeenCalledTimes(1);

    const next = refresh();
    resolve("token-2");
    await expect(next).resolves.toBe("token-2");
    expect(task).toHaveBeenCalledTimes(2);
  });
});

describe("authorized fetch", () => {
  function setup(options: { acceptedToken: string; refreshTo: string | null }) {
    let accessToken: string | null = "expired";
    const seen: { authorization: string | null; body: string }[] = [];
    const baseFetch = vi.fn(async (request: Request) => {
      seen.push({ authorization: request.headers.get("Authorization"), body: await request.text() });
      return new Response(null, { status: request.headers.get("Authorization") === `Bearer ${options.acceptedToken}` ? 200 : 401 });
    });
    const refreshTask = vi.fn(async () => {
      await new Promise((done) => setTimeout(done, 5));
      accessToken = options.refreshTo;
      return accessToken;
    });
    const onSessionExpired = vi.fn();
    const authorizedFetch = createAuthorizedFetch({
      fetch: baseFetch,
      getAccessToken: () => accessToken,
      refresh: singleFlight(refreshTask),
      onSessionExpired,
    });
    return { authorizedFetch, baseFetch, refreshTask, onSessionExpired, seen };
  }

  it("sends the bearer token and retries a 401 once after refreshing", async () => {
    const { authorizedFetch, refreshTask, onSessionExpired, seen } = setup({ acceptedToken: "fresh", refreshTo: "fresh" });
    const response = await authorizedFetch(new Request("http://api/api/v1/days", { method: "POST", body: '{"title":"x"}' }));

    expect(response.status).toBe(200);
    expect(refreshTask).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(seen).toEqual([
      { authorization: "Bearer expired", body: '{"title":"x"}' },
      { authorization: "Bearer fresh", body: '{"title":"x"}' },
    ]);
  });

  it("refreshes only once when several requests get 401 together", async () => {
    const { authorizedFetch, refreshTask, baseFetch } = setup({ acceptedToken: "fresh", refreshTo: "fresh" });
    const responses = await Promise.all(
      ["goals", "days", "events", "day-tags"].map((path) => authorizedFetch(new Request(`http://api/api/v1/${path}`))),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(refreshTask).toHaveBeenCalledTimes(1);
    expect(baseFetch).toHaveBeenCalledTimes(8);
  });

  it("ends the session when the refresh fails or the retry is still unauthorized", async () => {
    const failed = setup({ acceptedToken: "fresh", refreshTo: null });
    const response = await failed.authorizedFetch(new Request("http://api/api/v1/goals"));
    expect(response.status).toBe(401);
    expect(failed.onSessionExpired).toHaveBeenCalledTimes(1);
    expect(failed.baseFetch).toHaveBeenCalledTimes(1);

    const stillUnauthorized = setup({ acceptedToken: "never", refreshTo: "fresh" });
    expect((await stillUnauthorized.authorizedFetch(new Request("http://api/api/v1/goals"))).status).toBe(401);
    expect(stillUnauthorized.onSessionExpired).toHaveBeenCalledTimes(1);
    expect(stillUnauthorized.baseFetch).toHaveBeenCalledTimes(2);
  });
});
