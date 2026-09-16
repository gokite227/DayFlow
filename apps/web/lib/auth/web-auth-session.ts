import {
  createAuthorizedFetch,
  createDayFlowApiClient,
  createPkcePair,
  googleLoginStartUrl,
  parseAuthCallback,
  safeReturnTo,
  singleFlight,
  type MeResponse,
  type PkceCrypto,
} from "@dayflow/api-client";

/**
 * AUTH-004 on the Web. The access token lives only in this module's memory. The refresh token is an HttpOnly
 * cookie scoped to /api/v1/auth: script never sees it, so a reload restores the session with /auth/refresh.
 * Only the PKCE verifier and the return route are kept, briefly, in sessionStorage during the Google redirect.
 */
export type WebAuthState =
  | { status: "loading" }
  | { status: "signedOut"; message: string | null }
  | { status: "signedIn"; user: MeResponse };

/** The parts of sessionStorage this module uses (tests pass a Map-backed stand-in). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WebAuthSessionOptions {
  apiBaseUrl: string;
  /**
   * Origin of the refresh-cookie endpoints (exchange/refresh/logout): the Web's own origin, which proxies them to
   * the API (next.config.ts), so the cookie is first-party even when Web and API are different sites.
   */
  authBaseUrl: string;
  fetch: (request: Request) => Promise<Response>;
  storage: KeyValueStorage;
  crypto: PkceCrypto;
  /** Full page navigation to the API (the login leaves the app). */
  navigate: (url: string) => void;
  /** Called synchronously whenever the signed-in user changes (sign-in, sign-out, other user): clear caches. */
  onUserChanged: () => void;
  /** Delay before the one extra refresh attempt when another tab rotated the cookie at the same moment. */
  retryDelayMs?: number;
}

const VERIFIER_KEY = "dayflow.auth.pkceVerifier";
const RETURN_TO_KEY = "dayflow.auth.returnTo";
export const DEFAULT_ROUTE = "/today";

export type WebAuthSession = ReturnType<typeof createWebAuthSession>;

export function createWebAuthSession(options: WebAuthSessionOptions) {
  let state: WebAuthState = { status: "loading" };
  let accessToken: string | null = null;
  const listeners = new Set<() => void>();
  // Auth endpoints send the refresh cookie (credentials) and never an access token.
  const authApi = createDayFlowApiClient({ baseUrl: options.authBaseUrl, fetch: options.fetch, credentials: "include" });
  const completions = new Map<string, Promise<string>>();

  function publish(next: WebAuthState) {
    const previousUserId = state.status === "signedIn" ? state.user.id : null;
    const nextUserId = next.status === "signedIn" ? next.user.id : null;
    if (previousUserId !== nextUserId) options.onUserChanged();
    state = next;
    listeners.forEach((listener) => listener());
  }

  function signOutLocally(message: string | null) {
    accessToken = null;
    publish({ status: "signedOut", message });
  }

  async function requestRefresh(): Promise<string | null> {
    const { data, response } = await authApi.POST("/api/v1/auth/refresh", {});
    if (response.ok && data) return data.accessToken;
    return null;
  }

  /** One refresh for everyone waiting. A 401 is tried once more: another tab may have just rotated the cookie. */
  const refreshAccessToken = singleFlight(async (): Promise<string | null> => {
    try {
      let token = await requestRefresh();
      if (token === null) {
        await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 400));
        token = await requestRefresh();
      }
      accessToken = token;
      return token;
    } catch {
      // Network failure: keep the current state; the next request tries again.
      return null;
    }
  });

  /** The fetch every API call uses: Bearer token, one refresh + retry on 401, sign-out if that fails. */
  const authorizedFetch = createAuthorizedFetch({
    fetch: options.fetch,
    getAccessToken: () => accessToken,
    refresh: refreshAccessToken,
    onSessionExpired: () => {
      if (state.status !== "signedOut") signOutLocally("로그인이 만료되었어요. 다시 로그인해주세요.");
    },
  });
  const api = createDayFlowApiClient({ baseUrl: options.apiBaseUrl, fetch: authorizedFetch });

  async function loadUser(): Promise<MeResponse | null> {
    const { data, response } = await api.GET("/api/v1/me");
    return response.ok && data ? data : null;
  }

  return {
    api,
    getState: (): WebAuthState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** On page load: refresh (cookie) → access token → /me. No cookie or a revoked one means signed out. */
    async bootstrap(): Promise<void> {
      if (state.status !== "loading") return;
      const token = await refreshAccessToken();
      const user = token === null ? null : await loadUser();
      // A login completed meanwhile (callback page) wins over this page-load check.
      if (state.status !== "loading") return;
      if (user) publish({ status: "signedIn", user });
      else signOutLocally(null);
    },

    /** PKCE pair, remember verifier + route, then leave for the API's Google login. */
    async startGoogleLogin(returnTo: string | null): Promise<void> {
      const pkce = await createPkcePair(options.crypto);
      options.storage.setItem(VERIFIER_KEY, pkce.verifier);
      options.storage.setItem(RETURN_TO_KEY, safeReturnTo(returnTo) ?? DEFAULT_ROUTE);
      options.navigate(googleLoginStartUrl({ apiBaseUrl: options.apiBaseUrl, platform: "WEB", codeChallenge: pkce.challenge, returnTo }));
    },

    /** Development only (API with DAYFLOW_DEV_LOGIN_ENABLED): the same flow with a fake Google identity. */
    async startDevLogin(subject: string, email: string, returnTo: string | null): Promise<void> {
      const pkce = await createPkcePair(options.crypto);
      options.storage.setItem(VERIFIER_KEY, pkce.verifier);
      options.storage.setItem(RETURN_TO_KEY, safeReturnTo(returnTo) ?? DEFAULT_ROUTE);
      const query = new URLSearchParams({ platform: "WEB", codeChallenge: pkce.challenge, codeChallengeMethod: "S256", subject, email });
      options.navigate(`${options.apiBaseUrl.replace(/\/+$/, "")}/api/v1/auth/dev/login?${query.toString()}`);
    },

    /**
     * The /auth/callback page: exchange the one-time code (sets the refresh cookie), load the user and return the
     * route to go to. Runs once per code even if the page effect runs twice.
     */
    completeLogin(callbackUrl: string): Promise<string> {
      const callback = parseAuthCallback(callbackUrl);
      if (callback.kind !== "code") {
        return Promise.reject(new LoginCallbackError(callback.kind === "error" ? callback.error : "invalid_callback"));
      }
      let running = completions.get(callback.code);
      if (!running) {
        running = (async () => {
          const verifier = options.storage.getItem(VERIFIER_KEY);
          const storedReturnTo = options.storage.getItem(RETURN_TO_KEY);
          options.storage.removeItem(VERIFIER_KEY);
          options.storage.removeItem(RETURN_TO_KEY);
          if (!verifier) throw new LoginCallbackError("login_expired");

          const { data, response } = await authApi.POST("/api/v1/auth/exchange", {
            body: { code: callback.code, codeVerifier: verifier, platform: "WEB" },
          });
          if (!response.ok || !data) throw new LoginCallbackError("exchange_failed");
          accessToken = data.accessToken;
          const user = await loadUser();
          if (!user) throw new LoginCallbackError("exchange_failed");
          publish({ status: "signedIn", user });
          return safeReturnTo(storedReturnTo) ?? safeReturnTo(data.returnTo) ?? DEFAULT_ROUTE;
        })();
        completions.set(callback.code, running);
      }
      return running;
    },

    /** Revoke on the server (clears the cookie), then forget everything locally even if the server is unreachable. */
    async logout(): Promise<void> {
      try {
        await authApi.POST("/api/v1/auth/logout", {});
      } catch {
        // The refresh cookie still expires; the local session ends regardless.
      }
      signOutLocally(null);
    },
  };
}

export class LoginCallbackError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "LoginCallbackError";
    this.reason = reason;
  }
}
