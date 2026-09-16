import { resolveApiConfig, type ApiConfig } from "@/config/api-config";

/** Read once: EXPO_PUBLIC_* values are inlined into the bundle when Metro starts. */
export const apiConfig: ApiConfig = resolveApiConfig(process.env.EXPO_PUBLIC_DAYFLOW_API_BASE_URL);
