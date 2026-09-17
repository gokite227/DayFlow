package com.dayflow.api.ai.recovery;

import com.dayflow.api.ai.recovery.RecoveryCoachDtos.RecoveryCoachRequest;
import com.dayflow.api.ai.recovery.RecoveryCoachDtos.RecoveryCoachResponse;
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
 * AI Recovery Coach: recommendations for the current Recovery candidates. It changes nothing; a recommendation is
 * applied only through the existing Recovery preview and /recovery/apply or /recovery/carry-over/apply.
 */
@RestController
@RequestMapping("/api/v1/ai/coach")
public class RecoveryCoachController {

    private final RecoveryCoachService recoveryCoachService;

    public RecoveryCoachController(RecoveryCoachService recoveryCoachService) {
        this.recoveryCoachService = recoveryCoachService;
    }

    @PostMapping("/recovery")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "getRecoveryCoachRecommendations")
    @ApiResponse(responseCode = "400", description = "Invalid localDate or timezone",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "AI_COACH_BUSY: a Recovery Coach request of this user is still running",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "429", description = "AI_RATE_LIMITED: provider rate limit; see Retry-After",
            headers = @Header(name = "Retry-After", description = "Seconds to wait, when known", schema = @Schema(type = "integer")),
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "502", description = "AI_COACH_FAILED: provider error, timeout or unusable answer",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "503", description = "AI_COACH_UNAVAILABLE: no AI provider configured",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public RecoveryCoachResponse recovery(@Valid @RequestBody RecoveryCoachRequest request) {
        return recoveryCoachService.coach(request);
    }
}
