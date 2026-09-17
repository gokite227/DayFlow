package com.dayflow.api.ai.today;

import com.dayflow.api.ai.AiCoachProvider;
import com.dayflow.api.ai.AiProviderException;
import com.dayflow.api.ai.AiStructuredRequest;
import com.dayflow.api.ai.AiStructuredResult;
import com.dayflow.api.ai.today.TodayCoachDtos.TodayCoachRequest;
import com.dayflow.api.ai.today.TodayCoachDtos.TodayCoachResponse;
import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Today Coach flow: read the context (short read-only transaction) → call the provider outside any transaction →
 * validate → respond. Nothing is written: no Day changes, no AI history.
 *
 * <p>Deliberately not {@code @Transactional}: a slow provider must not hold a database connection.
 */
@Service
public class TodayCoachService {

    private static final Logger log = LoggerFactory.getLogger(TodayCoachService.class);

    /** The client's "today" may differ from the server's view of that timezone by at most this (date line, midnight). */
    static final long MAX_DATE_SKEW_DAYS = 1;

    private final TodayCoachContextService contextService;
    private final AiCoachProvider provider;
    private final CurrentUser currentUser;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    /** Users with a Coach request running; a second tap gets AI_COACH_BUSY instead of a second provider call. */
    private final Set<UUID> inFlight = ConcurrentHashMap.newKeySet();

    public TodayCoachService(TodayCoachContextService contextService, AiCoachProvider provider, CurrentUser currentUser,
            JsonMapper jsonMapper, Clock clock) {
        this.contextService = contextService;
        this.provider = provider;
        this.currentUser = currentUser;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    public TodayCoachResponse coach(TodayCoachRequest request) {
        if (!provider.available()) {
            throw new ApiException(ErrorCode.AI_COACH_UNAVAILABLE, "AI Coach is not connected.");
        }
        ZoneId zone = parseZone(request.timezone());
        Instant now = clock.instant();
        LocalDate serverToday = now.atZone(zone).toLocalDate();
        if (Math.abs(ChronoUnit.DAYS.between(serverToday, request.localDate())) > MAX_DATE_SKEW_DAYS) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "localDate must be today in the given timezone.",
                    "localDate");
        }

        UUID userId = currentUser.id();
        if (!inFlight.add(userId)) {
            throw new ApiException(ErrorCode.AI_COACH_BUSY, "A Coach request is already running.");
        }
        try {
            TodayCoachContext context = contextService.build(request.localDate(), zone, now);
            AiStructuredResult result = provider.generate(new AiStructuredRequest(TodayCoachPrompt.TASK,
                    TodayCoachPrompt.INSTRUCTIONS, jsonMapper.writeValueAsString(context.data()),
                    TodayCoachPrompt.SCHEMA_NAME, TodayCoachPrompt.outputSchema()));
            return TodayCoachValidator.validate(result.output(), context, now);
        } catch (AiProviderException failure) {
            throw toApiException(failure);
        } finally {
            inFlight.remove(userId);
        }
    }

    private ApiException toApiException(AiProviderException failure) {
        // The message is DayFlow's own classification text; it never contains user data or the raw answer.
        log.warn("ai.coach task={} provider={} failed kind={}", TodayCoachPrompt.TASK, provider.name(), failure.kind());
        return switch (failure.kind()) {
            case NOT_CONFIGURED -> new ApiException(ErrorCode.AI_COACH_UNAVAILABLE, "AI Coach is not connected.");
            case RATE_LIMITED -> new ApiException(ErrorCode.AI_RATE_LIMITED, "AI Coach is rate limited. Try again later.")
                    .withRetryAfter(failure.retryAfter());
            case TIMEOUT, UPSTREAM_ERROR, INVALID_OUTPUT ->
                    new ApiException(ErrorCode.AI_COACH_FAILED, "AI Coach could not answer. Try again.");
        };
    }

    private static ZoneId parseZone(String timezone) {
        if (timezone == null || !ZoneId.getAvailableZoneIds().contains(timezone)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "timezone must be a valid IANA timezone.", "timezone");
        }
        return ZoneId.of(timezone);
    }
}
