package com.dayflow.api.recovery;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.day.DayDtos.DayResponse;
import com.dayflow.api.day.DayStatus;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Request/response bodies of /api/v1/recovery and /api/v1/recovery-days. */
public final class RecoveryDtos {

    private RecoveryDtos() {
    }

    /** POST /recovery/apply: the plan the user confirmed after the preview. Applied all-or-nothing. */
    public record ApplyRecoveryRequest(
            @NotNull LocalDate localDate,
            @NotEmpty @Size(max = 200) List<@Valid RecoveryDecisionRequest> decisions) {
    }

    /** CARRY_OVER is not accepted here: it has its own preview/apply (/recovery/carry-over/*). */
    public record RecoveryDecisionRequest(
            @NotNull UUID dayId,
            @Schema(description = "The Day version the user saw in the preview")
            @NotNull @PositiveOrZero Long version,
            @NotNull RecoveryAction action,
            @Schema(types = {"integer", "null"}, format = "int32",
                    description = "REDUCE: the new, smaller estimate")
            @Positive Integer estimatedMinutes,
            @Schema(types = {"string", "null"}, description = "REDUCE: optional new title")
            @Size(max = 200) String title,
            @Schema(types = {"string", "null"}, format = "date",
                    description = "MOVE: today or later; inside the Day's WEEK Goal when it has one")
            LocalDate plannedDate) {
    }

    /** A reference to an entity together with the version the user saw. */
    public record VersionedIdRequest(
            @NotNull UUID id,
            @NotNull @PositiveOrZero Long version) {
    }

    /** Why a Day is offered in "놓친 계획 정리" (REC-001). */
    public enum RecoveryCandidateReason {
        /** Planned on an earlier date and not finished. */
        PAST_DATE,
        /** Planned today with a time placement that has already ended, and not finished. */
        TIME_PASSED
    }

    public record RecoveryCandidateResponse(
            @Schema(requiredMode = REQUIRED) DayResponse day,
            @Schema(requiredMode = REQUIRED) RecoveryCandidateReason reason,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"},
                    allowableValues = {"KEEP", "REDUCE", "MOVE", "CARRY_OVER", "DROP"},
                    description = "The last decision for this Day if it was handled before and its plan changed since")
            RecoveryAction lastAction) {
    }

    /** One decision in the /recovery history. Titles are the ones at decision time when the Day is gone. */
    public record RecoveryEventItemResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "uuid",
                    description = "null when the Day was deleted later")
            UUID dayId,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}) String dayTitle,
            @Schema(requiredMode = REQUIRED) RecoveryAction action,
            @Schema(requiredMode = REQUIRED) DayStatus previousStatus,
            @Schema(requiredMode = REQUIRED) DayStatus newStatus,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date") LocalDate previousPlannedDate,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date") LocalDate newPlannedDate,
            @Schema(requiredMode = REQUIRED) int previousEstimatedMinutes,
            @Schema(requiredMode = REQUIRED) int newEstimatedMinutes,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "uuid",
                    description = "CARRY_OVER: the Day created in the later period")
            UUID destinationDayId,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}) String destinationDayTitle,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date")
            LocalDate destinationPlannedDate) {
    }

    public record RecoveryEventResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) LocalDate localDate,
            @Schema(requiredMode = REQUIRED) Instant appliedAt,
            @Schema(requiredMode = REQUIRED) List<RecoveryEventItemResponse> items) {
    }

    public record ApplyRecoveryResponse(
            @Schema(requiredMode = REQUIRED) UUID eventId,
            @Schema(requiredMode = REQUIRED) LocalDate localDate,
            @Schema(requiredMode = REQUIRED) Instant appliedAt,
            @Schema(requiredMode = REQUIRED) List<DayResponse> days) {
    }

    /**
     * PUT /recovery-days/{date}. releaseCoreDays un-marks core Days of that date in the same transaction,
     * so "at most one core Day on a Recovery Day" is never half applied.
     */
    public record SaveRecoveryDayRequest(
            @Schema(types = {"string", "null"}, format = "date", description = "The date to come back, after the recovery day")
            LocalDate returnDate,
            @NotNull @Size(max = 500) String note,
            @JsonProperty(required = true)
            @Schema(requiredMode = REQUIRED, types = {"integer", "null"}, format = "int64",
                    description = "null to create; the current version to replace")
            @PositiveOrZero Long expectedVersion,
            @Schema(description = "Core Days planned on this date to un-mark, with the versions the user saw")
            @Size(max = 50) List<@Valid VersionedIdRequest> releaseCoreDays) {
    }

    public record RecoveryDayResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) LocalDate date,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date") LocalDate returnDate,
            @Schema(requiredMode = REQUIRED) String note,
            @Schema(requiredMode = REQUIRED) Instant createdAt,
            @Schema(requiredMode = REQUIRED) Instant updatedAt,
            @Schema(requiredMode = REQUIRED) long version) {

        static RecoveryDayResponse from(RecoveryDay day) {
            return new RecoveryDayResponse(day.getId(), day.getDate(), day.getReturnDate(), day.getNote(),
                    day.getCreatedAt(), day.getUpdatedAt(), day.getVersion());
        }
    }
}
