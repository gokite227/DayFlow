import {
  createAuthorizedFetch,
  createDayFlowApiClient,
  createPkcePair,
  googleLoginStartUrl,
  parseAuthCallback,
  singleFlight,
  type MeResponse,
  type PkceCrypto,
} from "@dayflow/api-client";

/**
 * AUTH-004 on Mobile. The access token lives only in memory; the refresh token only in the device's secure
 * storage (expo-secure-store, never AsyncStorage). Google login runs in the system browser and returns to
 * `dayflow://auth/callback` with a one-time code.
 */
export type MobileAuthState =
  | { status: "loading" }
  | { status: "signedOut"; message: string | null }
  /** A stored session could not be checked because the API is unreachable; the token is kept for a retry. */
  | { status: "offline" }
  | { status: "signedIn"; user: MeResponse };

/** One secret value in secure storage. Tests use an in-memory implementation. */
export interface SecretStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
}

export type AuthSessionResult = { type: "success"; url: string } | { type: "cancel" | "dismiss" | "locked" | "opened" };

export interface MobileAuthSessionOptions {
  apiBaseUrl: string;
  fetch: (request: Request) => Promise<Response>;
  refreshTokenStore: SecretStore;
  /** The PKCE verifier while the browser is open; secure storage so it survives Android killing the app. */
  verifierStore: SecretStore;
  crypto: PkceCrypto;
  /** expo-web-browser openAuthSessionAsync. */
  openAuthSession: (url: string, redirectUri: string) => Promise<AuthSessionResult>;
  redirectUri: string;
  /** Called synchronously whenever the signed-in user changes: clear the query cache. */
  onUserChanged: () => void;
  /** After logout or an ended session: remove data of the previous user from the device (e.g. reminders). */
  onSignedOut: () => void;
}

export const MOBILE_REDIRECT_URI = "dayflow://auth/callback";

export class MobileLoginError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "MobileLoginError";
    this.reason = reason;
  }
}

export type MobileAuthSession = ReturnType<typeof createMobileAuthSession>;

export function createMobileAuthSession(options: MobileAuthSessionOptions) {
  let state: MobileAuthState = { status: "loading" };
  let accessToken: string | null = null;
  const listeners = new Set<() => void>();
  const authApi = createDayFlowApiClient({ baseUrl: options.apiBaseUrl, fetch: options.fetch });
  const completions = new Map<string, Promise<void>>();

  function publish(next: MobileAuthState) {
    const previousUserId = state.status === "signedIn" ? state.user.id : null;
    const nextUserId = next.status === "signedIn" ? next.user.id : null;
    if (previousUserId !== nextUserId) options.onUserChanged();
    state = next;
    listeners.forEach((listener) => listener());
  }

  async function endSession(message: string | null) {
    const wasSignedIn = state.status === "signedIn";
    accessToken = null;
    await options.refreshTokenStore.clear();
    if (wasSignedIn) options.onSignedOut();
    publish({ status: "signedOut", message });
  }

  /**
   * One refresh at a time. The rotated refresh token is saved before the new access token is used. Returns null
   * when the session is invalid (the stored token is removed); a network failure throws and keeps the token.
   */
  const refreshAccessToken = singleFlight(async (): Promise<string | null> => {
    const refreshToken = await options.refreshTokenStore.get();
    if (!refreshToken) return null;
    const { data, response } = await authApi.POST("/api/v1/auth/refresh", { body: { refreshToken } });
    if (!response.ok || !data || !data.refreshToken) {
      if (response.status === 401 || response.status === 400) await options.refreshTokenStore.clear();
      accessToken = null;
      return null;
    }
    await options.refreshTokenStore.set(data.refreshToken);
    accessToken = data.accessToken;
    return accessToken;
  });

  const authorizedFetch = createAuthorizedFetch({
    fetch: options.fetch,
    getAccessToken: () => accessToken,
    refresh: refreshAccessToken,
    onSessionExpired: () => {
      if (state.status === "signedIn") void endSession("로그인이 만료되었어요. 다시 로그인해주세요.");
    },
  });
  const api = createDayFlowApiClient({ baseUrl: options.apiBaseUrl, fetch: authorizedFetch });

  async function loadUser(): Promise<MeResponse | null> {
    const { data, response } = await api.GET("/api/v1/me");
    return response.ok && data ? data : null;
  }

  function completeLogin(callbackUrl: string): Promise<void> {
    const callback = parseAuthCallback(callbackUrl);
    if (callback.kind !== "code") {
      return Promise.reject(new MobileLoginError(callback.kind === "error" ? callback.error : "invalid_callback"));
    }
    let running = completions.get(callback.code);
    if (!running) {
      running = (async () => {
        const verifier = await options.verifierStore.get();
        await options.verifierStore.clear();
        if (!verifier) throw new MobileLoginError("login_expired");
        const { data, response } = await authApi.POST("/api/v1/auth/exchange", {
          body: { code: callback.code, codeVerifier: verifier, platform: "MOBILE" },
        });
        if (!response.ok || !data || !data.refreshToken) throw new MobileLoginError("exchange_failed");
        await options.refreshTokenStore.set(data.refreshToken);
        accessToken = data.accessToken;
        const user = await loadUser();
        if (!user) throw new MobileLoginError("exchange_failed");
        publish({ status: "signedIn", user });
      })();
      completions.set(callback.code, running);
    }
    return running;
  }

  return {
    api,
    getState: (): MobileAuthState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** App start: secure storage → refresh → /me. No token: login. Unreachable API: offline with retry. */
    async bootstrap(): Promise<void> {
      if (state.status === "signedIn") return;
      publish({ status: "loading" });
      try {
        const token = await refreshAccessToken();
        const user = token === null ? null : await loadUser();
        if (state.status !== "loading") return;
        if (user) publish({ status: "signedIn", user });
        else await endSession(null);
      } catch {
        if (state.status === "loading") publish({ status: "offline" });
      }
    },

    /** PKCE → system browser → Google → `dayflow://auth/callback?code=` → exchange. Cancel keeps the login screen. */
    async signInWithGoogle(): Promise<void> {
      const pkce = await createPkcePair(options.crypto);
      await options.verifierStore.set(pkce.verifier);
      const url = googleLoginStartUrl({ apiBaseUrl: options.apiBaseUrl, platform: "MOBILE", codeChallenge: pkce.challenge });
      const result = await options.openAuthSession(url, options.redirectUri);
      if (result.type === "success") {
        await completeLogin(result.url);
      } else if (state.status !== "signedIn") {
        // Android may deliver the callback to the app route instead; that route completes the login itself.
        publish({ status: "signedOut", message: null });
      }
    },

    /** Used by signInWithGoogle and by the `auth/callback` route (Android). Runs once per code. */
    completeLogin,

    /** Revoke on the server, delete the secure token, clear caches and device data, show the login. */
    async logout(): Promise<void> {
      const refreshToken = await options.refreshTokenStore.get();
      if (refreshToken) {
        try {
          await authApi.POST("/api/v1/auth/logout", { body: { refreshToken } });
        } catch {
          // Offline: the token is still deleted locally and expires on the server.
        }
      }
      await endSession(null);
    },
  };
}
