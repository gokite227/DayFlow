import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./generated/schema";

/** A typed client for every path in the DayFlow OpenAPI document. */
export type DayFlowApiClient = Client<paths>;

export type DayFlowApiClientOptions = ClientOptions & {
  /**
   * API origin, e.g. from NEXT_PUBLIC_DAYFLOW_API_BASE_URL on web or app config on
   * mobile. Required: the client never falls back to a hard-coded host.
   */
  baseUrl: string;
};

/**
 * Creates a client for the DayFlow API. Pass a custom `fetch` for tests, server
 * rendering or React Native; all other options are forwarded to openapi-fetch.
 */
export function createDayFlowApiClient(options: DayFlowApiClientOptions): DayFlowApiClient {
  if (options.baseUrl.trim() === "") {
    throw new Error("DayFlow API baseUrl is required.");
  }
  return createClient<paths>(options);
}
