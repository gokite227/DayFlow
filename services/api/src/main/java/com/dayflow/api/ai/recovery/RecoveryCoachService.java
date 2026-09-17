package com.dayflow.api.ai.recovery;

import com.dayflow.api.ai.AiCoachRunner;
import com.dayflow.api.ai.AiStructuredRequest;
import com.dayflow.api.ai.AiStructuredResult;
import com.dayflow.api.ai.recovery.RecoveryCoachDtos.RecoveryCoachRequest;
import com.dayflow.api.ai.recovery.RecoveryCoachDtos.RecoveryCoachResponse;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Recovery Coach flow: read candidates and their options (read-only transaction) → provider outside any
 * transaction → validate → respond. Nothing is written; with no candidate the provider is not called at all.
 */
@Service
public class RecoveryCoachService {

    static final long MAX_DATE_SKEW_DAYS = 1;

    private final RecoveryCoachContextService contextService;
    private final AiCoachRunner runner;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public RecoveryCoachService(RecoveryCoachContextService contextService, AiCoachRunner runner, JsonMapper jsonMapper,
            Clock clock) {
        this.contextService = contextService;
        this.runner = runner;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    public RecoveryCoachResponse coach(RecoveryCoachRequest request) {
        runner.requireAvailable();
        ZoneId zone = AiCoachRunner.parseZone(request.timezone());
        Instant now = clock.instant();
        LocalDate serverToday = now.atZone(zone).toLocalDate();
        if (Math.abs(ChronoUnit.DAYS.between(serverToday, request.localDate())) > MAX_DATE_SKEW_DAYS) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "localDate must be today in the given timezone.",
                    "localDate");
        }

        return runner.runExclusive(RecoveryCoachPrompt.TASK, () -> {
            RecoveryCoachContext context = contextService.build(request.localDate(), now);
            if (context.candidateCount() == 0) {
                return new RecoveryCoachResponse(now, request.localDate(), "지금 다시 정리할 Day가 없어요", "", List.of(),
                        List.of(), 0, 0);
            }
            AiStructuredResult result = runner.provider().generate(new AiStructuredRequest(RecoveryCoachPrompt.TASK,
                    RecoveryCoachPrompt.INSTRUCTIONS, jsonMapper.writeValueAsString(context.data()),
                    RecoveryCoachPrompt.SCHEMA_NAME, RecoveryCoachPrompt.outputSchema()));
            return RecoveryCoachValidator.validate(result.output(), context, now);
        });
    }
}
