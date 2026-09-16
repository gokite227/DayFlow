/**
 * Runs one refresh at a time. While a refresh is in flight every other caller (e.g. several requests that all
 * got 401 at once) waits for the same result instead of starting its own refresh, so a rotated refresh token
 * is never used twice by the same client.
 */
export function singleFlight<T>(task: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  return () => {
    running ??= task().finally(() => {
      running = null;
    });
    return running;
  };
}

export interface AuthorizedFetchOptions {
  /** The platform fetch (globalThis.fetch). */
  fetch: (request: Request) => Promise<Response>;
  /** The access token in memory, or null when there is none yet. */
  getAccessToken: () => string | null;
  /** Gets a new access token (single-flight), or null when the session cannot be renewed. */
  refresh: () => Promise<string | null>;
  /** The session is gone: clear local auth state and show the login screen. */
  onSessionExpired: () => void;
}

/**
 * A fetch for the generated API client: sends `Authorization: Bearer <access token>` and, on 401, refreshes once
 * and retries the original request once. If the refresh fails or the retry is 401 again, the session ends.
 */
export function createAuthorizedFetch(options: AuthorizedFetchOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    // The body can be read only once: keep a copy for the retry before the first attempt.
    const retry = request.clone();
    const token = options.getAccessToken();
    const response = await options.fetch(withBearer(request, token));
    if (response.status !== 401) return response;

    const renewed = await options.refresh();
    if (renewed === null) {
      options.onSessionExpired();
      return response;
    }
    const retried = await options.fetch(withBearer(retry, renewed));
    if (retried.status === 401) options.onSessionExpired();
    return retried;
  };
}

function withBearer(request: Request, token: string | null): Request {
  if (token === null) return request;
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(request, { headers });
}
