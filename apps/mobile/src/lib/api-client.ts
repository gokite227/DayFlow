import type { DayFlowApiClient } from "@dayflow/api-client";
import { getMobileAuthSession } from "@/features/auth/auth-session";

export { apiConfig } from "./api-config";

/**
 * Shared generated client. Every call goes through the auth session's fetch: Bearer access token, one refresh
 * on 401 (features/auth/mobile-auth-session.ts). The root layout does not render screens while the config is
 * invalid or the user is signed out.
 */
export function getDayFlowApiClient(): DayFlowApiClient {
  return getMobileAuthSession().api;
}
