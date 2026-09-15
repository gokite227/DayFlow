package com.dayflow.api.recovery;

import com.dayflow.api.common.ProblemResponse;
import com.dayflow.api.recovery.RecoveryDtos.ApplyRecoveryRequest;
import com.dayflow.api.recovery.RecoveryDtos.ApplyRecoveryResponse;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryDayResponse;
import com.dayflow.api.recovery.RecoveryDtos.SaveRecoveryDayRequest;
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

    public RecoveryController(RecoveryService recoveryService) {
        this.recoveryService = recoveryService;
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
