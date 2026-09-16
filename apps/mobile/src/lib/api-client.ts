import { createDayFlowApiClient, type DayFlowApiClient } from "@dayflow/api-client";
import { resolveApiConfig, type ApiConfig } from "@/config/api-config";

/** Read once: EXPO_PUBLIC_* values are inlined into the bundle when Metro starts. */
export const apiConfig: ApiConfig = resolveApiConfig(process.env.EXPO_PUBLIC_DAYFLOW_API_BASE_URL);

let client: DayFlowApiClient | undefined;

/** Shared generated client. The root layout does not render screens while the config is invalid. */
export function getDayFlowApiClient(): DayFlowApiClient {
  if (!apiConfig.ok) {
    throw new Error("DayFlow API base URL is not configured (EXPO_PUBLIC_DAYFLOW_API_BASE_URL).");
  }
  client ??= createDayFlowApiClient({ baseUrl: apiConfig.baseUrl });
  return client;
}