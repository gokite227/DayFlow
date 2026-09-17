package com.dayflow.api.ai;

import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import java.time.ZoneId;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * What every Coach (Today, Review, …) does around its provider call, so the rules stay the same everywhere:
 * <ul>
 *   <li>no provider → AI_COACH_UNAVAILABLE before any work</li>
 *   <li>one running request per user and task → a second tap gets AI_COACH_BUSY, not a second provider call</li>
 *   <li>provider failures → AI_COACH_UNAVAILABLE / AI_RATE_LIMITED (+ Retry-After) / AI_COACH_FAILED</li>
 * </ul>
 * Messages are DayFlow's own texts; they never contain user data or the provider's answer.
 */
@Component
public class AiCoachRunner {

    private static final Logger log = LoggerFactory.getLogger(AiCoachRunner.class);

    private final AiCoachProvider provider;
    private final CurrentUser currentUser;
    private final Set<String> inFlight = ConcurrentHashMap.newKeySet();

    public AiCoachRunner(AiCoachProvider provider, CurrentUser currentUser) {
        this.provider = provider;
        this.currentUser = currentUser;
    }

    public AiCoachProvider provider() {
        return provider;
    }

    public void requireAvailable() {
        if (!provider.available()) {
            throw new ApiException(ErrorCode.AI_COACH_UNAVAILABLE, "AI Coach is not connected.");
        }
    }

    /** Runs {@code call} (context read, provider call, validation) as the only request of this user for {@code task}. */
    public <T> T runExclusive(String task, Supplier<T> call) {
        String key = currentUser.id() + ":" + task;
        if (!inFlight.add(key)) {
            throw new ApiException(ErrorCode.AI_COACH_BUSY, "A Coach request is already running.");
        }
        try {
            return call.get();
        } catch (AiProviderException failure) {
            throw toApiException(task, failure);
        } finally {
            inFlight.remove(key);
        }
    }

    private ApiException toApiException(String task, AiProviderException failure) {
        log.warn("ai.coach task={} provider={} failed kind={}", task, provider.name(), failure.kind());
        return switch (failure.kind()) {
            case NOT_CONFIGURED -> new ApiException(ErrorCode.AI_COACH_UNAVAILABLE, "AI Coach is not connected.");
            case RATE_LIMITED -> new ApiException(ErrorCode.AI_RATE_LIMITED, "AI Coach is rate limited. Try again later.")
                    .withRetryAfter(failure.retryAfter());
            case TIMEOUT, UPSTREAM_ERROR, INVALID_OUTPUT ->
                    new ApiException(ErrorCode.AI_COACH_FAILED, "AI Coach could not answer. Try again.");
        };
    }

    public static ZoneId parseZone(String timezone) {
        if (timezone == null || !ZoneId.getAvailableZoneIds().contains(timezone)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "timezone must be a valid IANA timezone.", "timezone");
        }
        return ZoneId.of(timezone);
    }
}
