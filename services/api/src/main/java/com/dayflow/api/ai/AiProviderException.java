package com.dayflow.api.ai;

import java.time.Duration;

/**
 * A provider failure, classified so every Coach maps it to the same API error. The message never contains prompt,
 * user data, the provider's raw answer or the API key.
 */
public class AiProviderException extends RuntimeException {

    public enum Kind {
        /** No provider or no API key. */
        NOT_CONFIGURED,
        /** HTTP 429 from the provider. */
        RATE_LIMITED,
        TIMEOUT,
        /** 5xx, network error, 401/403/400 from the provider. */
        UPSTREAM_ERROR,
        /** The answer is not a usable JSON object. */
        INVALID_OUTPUT
    }

    private final Kind kind;
    private final Duration retryAfter;

    public AiProviderException(Kind kind, String message) {
        this(kind, message, null);
    }

    public AiProviderException(Kind kind, String message, Duration retryAfter) {
        super(message);
        this.kind = kind;
        this.retryAfter = retryAfter;
    }

    public Kind kind() {
        return kind;
    }

    /** From the provider's Retry-After header, or null. */
    public Duration retryAfter() {
        return retryAfter;
    }
}
