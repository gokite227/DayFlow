package com.dayflow.api.ai.planning;

import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningCoachRequest;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningCoachResponse;
import com.dayflow.api.common.ProblemResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI Planning Coach: checks the plan of one week of a Goal. It changes nothing; each suggestion is applied by the user
 * through PATCH /days/{id}, PUT /days/{id}/schedule or POST /days.
 */
@RestController
@RequestMapping("/api/v1/ai/coach")
public class PlanningCoachController {

    private final PlanningCoachService planningCoachService;

    public PlanningCoachController(PlanningCoachService planningCoachService) {
        this.planningCoachService = planningCoachService;
    }

    @PostMapping("/planning")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "getPlanningCoachSuggestions")
    @ApiResponse(responseCode = "400", description = "Not a WEEK/PERIOD Goal, invalid week, ended period or timezone",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "404", description = "Goal not found (GOAL_NOT_FOUND)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "AI_COACH_BUSY: a Planning Coach request of this user is still running",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "429", description = "AI_RATE_LIMITED: provider rate limit; see Retry-After",
            headers = @Header(name = "Retry-After", description = "Seconds to wait, when known", schema = @Schema(type = "integer")),
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "502", description = "AI_COACH_FAILED: provider error, timeout or unusable answer",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "503", description = "AI_COACH_UNAVAILABLE: no AI provider configured",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public PlanningCoachResponse planning(@Valid @RequestBody PlanningCoachRequest request) {
        return planningCoachService.coach(request);
    }
}
