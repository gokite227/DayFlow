package com.dayflow.api.ai.planning;

import com.dayflow.api.ai.AiCoachRunner;
import com.dayflow.api.ai.AiStructuredRequest;
import com.dayflow.api.ai.AiStructuredResult;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningCoachRequest;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningCoachResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Planning Coach flow: validate the planned period → read the context (read-only transaction) → provider outside
 * any transaction → validate → respond. Nothing is written; every suggestion is applied separately by the user.
 */
@Service
public class PlanningCoachService {

    private final PlanningCoachContextService contextService;
    private final AiCoachRunner runner;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public PlanningCoachService(PlanningCoachContextService contextService, AiCoachRunner runner, JsonMapper jsonMapper,
            Clock clock) {
        this.contextService = contextService;
        this.runner = runner;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    public PlanningCoachResponse coach(PlanningCoachRequest request) {
        runner.requireAvailable();
        ZoneId zone = AiCoachRunner.parseZone(request.timezone());
        Instant now = clock.instant();
        LocalDate today = now.atZone(zone).toLocalDate();
        // Invalid Goals and periods fail before any provider work (404 / 400).
        contextService.target(request.goalId(), request.weekStart(), today);

        return runner.runExclusive(PlanningCoachPrompt.TASK, () -> {
            PlanningCoachContext context = contextService.build(request.goalId(), request.weekStart(), today);
            AiStructuredResult result = runner.provider().generate(new AiStructuredRequest(PlanningCoachPrompt.TASK,
                    PlanningCoachPrompt.INSTRUCTIONS, jsonMapper.writeValueAsString(context.data()),
                    PlanningCoachPrompt.SCHEMA_NAME, PlanningCoachPrompt.outputSchema()));
            return PlanningCoachValidator.validate(result.output(), context, now);
        });
    }
}
