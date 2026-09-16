import { createWebAuthSession, type WebAuthSession } from "./web-auth-session";

let session: WebAuthSession | undefined;
let userChangedListener: () => void = () => undefined;

/** The one browser session of this tab, created on first use (client only). */
export function getWebAuthSession(): WebAuthSession {
  if (!session) {
    const apiBaseUrl = process.env.NEXT_PUBLIC_DAYFLOW_API_BASE_URL;
    if (!apiBaseUrl) {
      throw new Error("NEXT_PUBLIC_DAYFLOW_API_BASE_URL is not set. Copy apps/web/.env.example to apps/web/.env.local.");
    }
    session = createWebAuthSession({
      apiBaseUrl,
      // Same-origin cookie endpoints, proxied to the API by next.config.ts rewrites.
      authBaseUrl: window.location.origin,
      fetch: (request) => globalThis.fetch(request),
      storage: window.sessionStorage,
      crypto: {
        randomBytes: (length) => window.crypto.getRandomValues(new Uint8Array(length)),
        sha256: async (data) => new Uint8Array(await window.crypto.subtle.digest("SHA-256", data)),
      },
      navigate: (url) => window.location.assign(url),
      onUserChanged: () => userChangedListener(),
    });
  }
  return session;
}

/** The query cache registers here so a user change clears it before any screen renders with the new user. */
export function setUserChangedListener(listener: () => void): void {
  userChangedListener = listener;
}

/** Development-only login form (NEXT_PUBLIC_DAYFLOW_DEV_LOGIN=true with an API that enables dev login). */
export const devLoginEnabled = process.env.NEXT_PUBLIC_DAYFLOW_DEV_LOGIN === "true";
