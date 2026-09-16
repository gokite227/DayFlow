package com.dayflow.api.recovery;

import com.dayflow.api.common.ProblemResponse;
import com.dayflow.api.recovery.CarryOverDtos.ApplyCarryOverRequest;
import com.dayflow.api.recovery.CarryOverDtos.ApplyCarryOverResponse;
import com.dayflow.api.recovery.CarryOverDtos.CarryOverPreviewRequest;
import com.dayflow.api.recovery.CarryOverDtos.CarryOverPreviewResponse;
import com.dayflow.api.recovery.RecoveryDtos.ApplyRecoveryRequest;
import com.dayflow.api.recovery.RecoveryDtos.ApplyRecoveryResponse;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryCandidateResponse;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryDayResponse;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryEventResponse;
import com.dayflow.api.recovery.RecoveryDtos.SaveRecoveryDayRequest;
import java.time.OffsetDateTime;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@ApiResponse(responseCode = "400", description = "Invalid request or recovery decision",
        content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
public class RecoveryController {

    private final RecoveryService recoveryService;
    private final CarryOverService carryOverService;

    public RecoveryController(RecoveryService recoveryService, CarryOverService carryOverService) {
        this.recoveryService = recoveryService;
        this.carryOverService = carryOverService;
    }

    /**
     * REC-001 missed Days. {@code today} is the user's local date and {@code now} the current instant, so
     * the rule follows the user's calendar like the Day/Calendar screens do.
     */
    @GetMapping("/recovery/candidates")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "listRecoveryCandidates")
    public List<RecoveryCandidateResponse> candidates(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate today,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime now) {
        return recoveryService.candidates(today, now.toInstant());
    }

    /** REC-005 applied decisions, newest first. */
    @GetMapping("/recovery/events")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "listRecoveryEvents")
    public List<RecoveryEventResponse> history(@RequestParam(defaultValue = "30") int limit) {
        return recoveryService.history(limit);
    }

    /** REC-004: the plan a Carry Over would apply. Changes nothing. */
    @PostMapping("/recovery/carry-over/preview")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "previewCarryOver")
    @ApiResponse(responseCode = "404", description = "The source Day was not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "The Day was already carried over (ALREADY_CARRIED_OVER)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public CarryOverPreviewResponse previewCarryOver(@Valid @RequestBody CarryOverPreviewRequest request) {
        return carryOverService.preview(request);
    }

    /** REC-003: creates the previewed Goals and Days in one transaction and records the decision. */
    @PostMapping("/recovery/carry-over/apply")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "applyCarryOver")
    @ApiResponse(responseCode = "404", description = "The source Day was not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "A Day or Goal changed after the preview (VERSION_CONFLICT) or the Day was already carried over; nothing was applied",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public ApplyCarryOverResponse applyCarryOver(@Valid @RequestBody ApplyCarryOverRequest request) {
        return carryOverService.apply(request);
    }

    /** Applies a previewed KEEP/REDUCE/MOVE/DROP plan all-or-nothing and records it. */
    @PostMapping("/recovery/apply")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "applyRecovery")
    @ApiResponse(responseCode = "404", description = "A Day was not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "A Day version is stale (VERSION_CONFLICT); nothing was applied",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public ApplyRecoveryResponse apply(@Valid @RequestBody ApplyRecoveryRequest request) {
        return recoveryService.apply(request);
    }

    @GetMapping("/recovery-days")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "listRecoveryDays")
    public List<RecoveryDayResponse> listDays(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return recoveryService.listDays(from, to);
    }

    @PutMapping("/recovery-days/{date}")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "saveRecoveryDay")
    @ApiResponse(responseCode = "409", description = "expectedVersion does not match (VERSION_CONFLICT)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public RecoveryDayResponse saveDay(
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @Valid @RequestBody SaveRecoveryDayRequest request) {
        return recoveryService.saveDay(date, request);
    }

    @DeleteMapping("/recovery-days/{date}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteRecoveryDay")
    @ApiResponse(responseCode = "404", description = "Not a recovery day",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public void deleteDay(@PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        recoveryService.deleteDay(date);
    }
}
