import type { DayFlowApiClient } from "@dayflow/api-client";
import { getWebAuthSession } from "./auth/session";

/**
 * Shared DayFlow API client. Every call goes through the auth session's fetch, which adds the access token and
 * refreshes it once on 401 (lib/auth/web-auth-session.ts). The base URL comes from
 * NEXT_PUBLIC_DAYFLOW_API_BASE_URL (see apps/web/.env.example).
 */
export function getDayFlowApiClient(): DayFlowApiClient {
  return getWebAuthSession().api;
}
