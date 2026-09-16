import * as SecureStore from "expo-secure-store";
import type { SecretStore } from "./mobile-auth-session";

/**
 * Keychain (iOS) / Keystore-encrypted storage (Android). Only the refresh token and, during a login, the PKCE
 * verifier are stored; the access token never leaves memory.
 */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

function secureValue(key: string): SecretStore {
  return {
    get: () => SecureStore.getItemAsync(key, OPTIONS),
    set: (value) => SecureStore.setItemAsync(key, value, OPTIONS),
    clear: () => SecureStore.deleteItemAsync(key, OPTIONS),
  };
}

export const refreshTokenStore = secureValue("dayflow.auth.refreshToken");
export const verifierStore = secureValue("dayflow.auth.pkceVerifier");
