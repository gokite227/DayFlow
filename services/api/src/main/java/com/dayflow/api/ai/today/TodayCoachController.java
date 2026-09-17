package com.dayflow.api.ai.today;

import com.dayflow.api.ai.today.TodayCoachDtos.TodayCoachRequest;
import com.dayflow.api.ai.today.TodayCoachDtos.TodayCoachResponse;
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
 * AI Today Coach. POST because every call is a new (billed, rate-limited) generation, never a cacheable read. The
 * answer only proposes; applying a suggestion is a normal PATCH /api/v1/days/{dayId} by the client after the user
 * confirms.
 */
@RestController
@RequestMapping("/api/v1/ai/coach")
public class TodayCoachController {

    private final TodayCoachService todayCoachService;

    public TodayCoachController(TodayCoachService todayCoachService) {
        this.todayCoachService = todayCoachService;
    }

    @PostMapping("/today")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "getTodayCoach")
    @ApiResponse(responseCode = "400", description = "Invalid localDate or timezone",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "AI_COACH_BUSY: a Coach request of this user is still running",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "429", description = "AI_RATE_LIMITED: provider rate limit; see Retry-After",
            headers = @Header(name = "Retry-After", description = "Seconds to wait, when known", schema = @Schema(type = "integer")),
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "502", description = "AI_COACH_FAILED: provider error, timeout or unusable answer",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "503", description = "AI_COACH_UNAVAILABLE: no AI provider configured",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public TodayCoachResponse today(@Valid @RequestBody TodayCoachRequest request) {
        return todayCoachService.coach(request);
    }
}
