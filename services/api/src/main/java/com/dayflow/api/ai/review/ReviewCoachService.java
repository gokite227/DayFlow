package com.dayflow.api.ai.review;

import com.dayflow.api.ai.AiCoachRunner;
import com.dayflow.api.ai.AiStructuredRequest;
import com.dayflow.api.ai.AiStructuredResult;
import com.dayflow.api.ai.review.ReviewCoachDtos.ReviewCoachRequest;
import com.dayflow.api.ai.review.ReviewCoachDtos.ReviewCoachResponse;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Review Coach flow: validate the period → read the context (read-only transaction) → call the provider outside
 * any transaction → validate → respond with a KPT draft. Nothing is written: no Review, no AI history.
 */
@Service
public class ReviewCoachService {

    private final ReviewCoachContextService contextService;
    private final AiCoachRunner runner;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public ReviewCoachService(ReviewCoachContextService contextService, AiCoachRunner runner, JsonMapper jsonMapper,
            Clock clock) {
        this.contextService = contextService;
        this.runner = runner;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    public ReviewCoachResponse coach(ReviewCoachRequest request) {
        runner.requireAvailable();
        ZoneId zone = AiCoachRunner.parseZone(request.timezone());
        // Same canonical periods as PUT /reviews/{type}/{periodStart}.
        LocalDate periodEnd = request.type().periodEnd(request.periodStart());
        if (periodEnd == null) {
            throw new ApiException(ErrorCode.INVALID_REVIEW_PERIOD,
                    request.periodStart() + " is not the first day of a " + request.type() + " period.", "periodStart");
        }
        Instant now = clock.instant();
        LocalDate today = now.atZone(zone).toLocalDate();
        if (request.periodStart().isAfter(today)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "A period that has not started cannot be reviewed.",
                    "periodStart");
        }

        return runner.runExclusive(ReviewCoachPrompt.TASK, () -> {
            ReviewCoachContext context = contextService.build(request.type(), request.periodStart(), periodEnd, today);
            AiStructuredResult result = runner.provider().generate(new AiStructuredRequest(ReviewCoachPrompt.TASK,
                    ReviewCoachPrompt.INSTRUCTIONS, jsonMapper.writeValueAsString(context.data()),
                    ReviewCoachPrompt.SCHEMA_NAME, ReviewCoachPrompt.outputSchema()));
            return ReviewCoachValidator.validate(result.output(), context, now);
        });
    }
}
