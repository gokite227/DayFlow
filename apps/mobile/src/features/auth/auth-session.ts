import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { apiConfig } from "@/lib/api-config";
import { createMobileAuthSession, MOBILE_REDIRECT_URI, type MobileAuthSession } from "./mobile-auth-session";
import { refreshTokenStore, verifierStore } from "./secure-store";

let session: MobileAuthSession | undefined;
let listeners: { userChanged: () => void; signedOut: () => void } = {
  userChanged: () => undefined,
  signedOut: () => undefined,
};

/** The app's single auth session. The root layout only uses it when the API base URL is configured. */
export function getMobileAuthSession(): MobileAuthSession {
  if (!apiConfig.ok) {
    throw new Error("DayFlow API base URL is not configured (EXPO_PUBLIC_DAYFLOW_API_BASE_URL).");
  }
  session ??= createMobileAuthSession({
    apiBaseUrl: apiConfig.baseUrl,
    fetch: (request) => globalThis.fetch(request),
    refreshTokenStore,
    verifierStore,
    crypto: {
      randomBytes: (length) => Crypto.getRandomBytes(length),
      sha256: async (data) => new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data)),
    },
    openAuthSession: async (url, redirectUri) => {
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
      return result.type === "success" && "url" in result ? { type: "success", url: result.url } : { type: "cancel" };
    },
    redirectUri: MOBILE_REDIRECT_URI,
    onUserChanged: () => listeners.userChanged(),
    onSignedOut: () => listeners.signedOut(),
  });
  return session;
}

/**
 * Set by the root layout: clear the query cache when the user changes, and remove the previous user's data from
 * the device (scheduled reminders) after a sign-out. Kept outside this module to avoid import cycles.
 */
export function setAuthSessionListeners(next: { userChanged: () => void; signedOut: () => void }): void {
  listeners = next;
}
