package com.dayflow.api.recovery;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.day.DayDtos.DayResponse;
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
                    description = "MOVE: the new date inside the Day's WEEK Goal")
            LocalDate plannedDate) {
    }

    public record ApplyRecoveryResponse(
            @Schema(requiredMode = REQUIRED) UUID eventId,
            @Schema(requiredMode = REQUIRED) LocalDate localDate,
            @Schema(requiredMode = REQUIRED) Instant appliedAt,
            @Schema(requiredMode = REQUIRED) List<DayResponse> days) {
    }

    /** PUT /recovery-days/{date}. */
    public record SaveRecoveryDayRequest(
            @Schema(types = {"string", "null"}, format = "date", description = "The date to come back, after the recovery day")
            LocalDate returnDate,
            @NotNull @Size(max = 500) String note,
            @JsonProperty(required = true)
            @Schema(requiredMode = REQUIRED, types = {"integer", "null"}, format = "int64",
                    description = "null to create; the current version to replace")
            @PositiveOrZero Long expectedVersion) {
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
