package com.dayflow.api.ai;

import tools.jackson.databind.JsonNode;

/**
 * The provider's answer as a JSON object — still untrusted until the Coach validates it.
 *
 * @param output           the parsed JSON object
 * @param model            the model that answered
 * @param promptTokens     usage reported by the provider, or null
 * @param completionTokens usage reported by the provider, or null
 */
public record AiStructuredResult(JsonNode output, String model, Long promptTokens, Long completionTokens) {
}
