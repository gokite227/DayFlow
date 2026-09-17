package com.dayflow.api.ai;

import java.util.Map;

/**
 * A structured generation request, independent of the provider.
 *
 * <p>Instructions and data are kept apart on purpose (prompt injection): {@code instructions} is DayFlow's own text and
 * becomes the system message; {@code dataJson} is user-generated content (Day, Goal, Review text) serialized as JSON and
 * sent separately, only ever as data.
 *
 * @param task         stable id of the Coach task, e.g. "today-coach" (logs, fixtures)
 * @param instructions system instructions written by DayFlow
 * @param dataJson     the context as a JSON document; never contains instructions
 * @param schemaName   name of the output schema
 * @param outputSchema JSON Schema of the answer (strict-mode compatible: every property required,
 *                     additionalProperties false)
 */
public record AiStructuredRequest(
        String task,
        String instructions,
        String dataJson,
        String schemaName,
        Map<String, Object> outputSchema) {
}
