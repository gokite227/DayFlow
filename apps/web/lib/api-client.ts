import { createDayFlowApiClient, type DayFlowApiClient } from "@dayflow/api-client";

let client: DayFlowApiClient | undefined;

/**
 * Shared DayFlow API client. The base URL comes from NEXT_PUBLIC_DAYFLOW_API_BASE_URL
 * (see apps/web/.env.example) and is read on first use, not at import time.
 */
export function getDayFlowApiClient(): DayFlowApiClient {
  if (!client) {
    const baseUrl = process.env.NEXT_PUBLIC_DAYFLOW_API_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        "NEXT_PUBLIC_DAYFLOW_API_BASE_URL is not set. Copy apps/web/.env.example to apps/web/.env.local.",
      );
    }
    client = createDayFlowApiClient({ baseUrl });
  }
  return client;
}
