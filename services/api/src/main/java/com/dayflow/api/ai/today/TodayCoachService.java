package com.dayflow.api.ai.today;

import com.dayflow.api.ai.AiCoachRunner;
import com.dayflow.api.ai.AiStructuredRequest;
import com.dayflow.api.ai.AiStructuredResult;
import com.dayflow.api.ai.today.TodayCoachDtos.TodayCoachRequest;
import com.dayflow.api.ai.today.TodayCoachDtos.TodayCoachResponse;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
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

    /** The client's "today" may differ from the server's view of that timezone by at most this (date line, midnight). */
    static final long MAX_DATE_SKEW_DAYS = 1;

    private final TodayCoachContextService contextService;
    private final AiCoachRunner runner;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public TodayCoachService(TodayCoachContextService contextService, AiCoachRunner runner, JsonMapper jsonMapper,
            Clock clock) {
        this.contextService = contextService;
        this.runner = runner;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    public TodayCoachResponse coach(TodayCoachRequest request) {
        runner.requireAvailable();
        ZoneId zone = AiCoachRunner.parseZone(request.timezone());
        Instant now = clock.instant();
        LocalDate serverToday = now.atZone(zone).toLocalDate();
        if (Math.abs(ChronoUnit.DAYS.between(serverToday, request.localDate())) > MAX_DATE_SKEW_DAYS) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "localDate must be today in the given timezone.",
                    "localDate");
        }

        return runner.runExclusive(TodayCoachPrompt.TASK, () -> {
            TodayCoachContext context = contextService.build(request.localDate(), zone, now);
            AiStructuredResult result = runner.provider().generate(new AiStructuredRequest(TodayCoachPrompt.TASK,
                    TodayCoachPrompt.INSTRUCTIONS, jsonMapper.writeValueAsString(context.data()),
                    TodayCoachPrompt.SCHEMA_NAME, TodayCoachPrompt.outputSchema()));
            return TodayCoachValidator.validate(result.output(), context, now);
        });
    }
}
