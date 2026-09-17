package com.dayflow.api.common;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.util.List;

/** A rule violation or missing resource reported to the client with an {@link ErrorCode}. */
public class ApiException extends RuntimeException {

    public record FieldViolation(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String field,
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String message) {
    }

    private final ErrorCode code;
    private final List<FieldViolation> fieldErrors;
    /** Sent as the Retry-After header (seconds) when set, e.g. for AI_RATE_LIMITED. */
    private Duration retryAfter;

    public ApiException(ErrorCode code, String detail) {
        this(code, detail, List.of());
    }

    public ApiException(ErrorCode code, String detail, String field) {
        this(code, detail, List.of(new FieldViolation(field, detail)));
    }

    public ApiException(ErrorCode code, String detail, List<FieldViolation> fieldErrors) {
        super(detail);
        this.code = code;
        this.fieldErrors = List.copyOf(fieldErrors);
    }

    public ErrorCode getCode() {
        return code;
    }

    public List<FieldViolation> getFieldErrors() {
        return fieldErrors;
    }

    public Duration getRetryAfter() {
        return retryAfter;
    }

    public ApiException withRetryAfter(Duration retryAfter) {
        this.retryAfter = retryAfter;
        return this;
    }
}
