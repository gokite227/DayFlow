package com.dayflow.api.common;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.common.ApiException.FieldViolation;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * OpenAPI description of the Problem Details body that {@link GlobalExceptionHandler}
 * returns as {@value #MEDIA_TYPE}. Documentation only: the runtime body is Spring's
 * ProblemDetail, and OpenApiContractTest checks that both have the same fields.
 */
@Schema(name = "ProblemResponse", description = "Error response for every API failure (RFC 9457 Problem Details)")
public record ProblemResponse(
        @Schema(requiredMode = REQUIRED, description = "HTTP status code") int status,
        @Schema(requiredMode = REQUIRED) String title,
        @Schema(requiredMode = REQUIRED) String detail,
        @Schema(requiredMode = REQUIRED, description = "Request path") String instance,
        @Schema(requiredMode = REQUIRED,
                description = "Stable code to branch on: an ErrorCode name, VALIDATION_ERROR, or HTTP_<status>")
        String code,
        @Schema(requiredMode = REQUIRED) List<FieldViolation> fieldErrors,
        @Schema(requiredMode = REQUIRED) String traceId) {

    public static final String MEDIA_TYPE = "application/problem+json";
}
