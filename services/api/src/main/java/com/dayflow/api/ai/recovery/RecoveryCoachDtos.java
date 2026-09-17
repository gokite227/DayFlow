package com.dayflow.api.ai.recovery;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.ai.CoachFact;
import com.dayflow.api.recovery.RecoveryAction;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Recovery Coach request and response. Recommendations are proposals only: the client turns one into the existing
 * Recovery choice of that Day, shows the existing preview, and applies with /recovery/apply or
 * /recovery/carry-over/apply after the user confirms.
 */
public final class RecoveryCoachDtos {

    private RecoveryCoachDtos() {
    }

    /** The user's "today" (same rule as GET /recovery/candidates). */
    public record RecoveryCoachRequest(
            @Schema(requiredMode = REQUIRED) @NotNull LocalDate localDate,
            @Schema(requiredMode = REQUIRED, example = "Asia/Seoul") @NotBlank @Size(max = 64) String timezone) {
    }

    public record RecoveryCoachObservation(
            @Schema(requiredMode = REQUIRED) String message,
            @Schema(requiredMode = REQUIRED) List<CoachFact> evidence) {
    }

    /**
     * @param targetDate MOVE: the new date; CARRY_OVER: the date of the new plan; null for KEEP, REDUCE and DROP.
     *                   Always one of the dates DayFlow offered for this Day.
     */
    public record RecoveryRecommendation(
            @Schema(requiredMode = REQUIRED) UUID dayId,
            @Schema(requiredMode = REQUIRED) String dayTitle,
            @Schema(requiredMode = REQUIRED) RecoveryAction action,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date",
                    description = "MOVE / CARRY_OVER only")
            LocalDate targetDate,
            @Schema(requiredMode = REQUIRED) String reason,
            @Schema(requiredMode = REQUIRED) List<CoachFact> evidence) {
    }

    public record RecoveryCoachResponse(
            @Schema(requiredMode = REQUIRED) Instant generatedAt,
            @Schema(requiredMode = REQUIRED) LocalDate localDate,
            @Schema(requiredMode = REQUIRED) String headline,
            @Schema(requiredMode = REQUIRED) String summary,
            @Schema(requiredMode = REQUIRED, description = "At most 3") List<RecoveryCoachObservation> observations,
            @Schema(requiredMode = REQUIRED, description = "At most one per candidate; never applied automatically")
            List<RecoveryRecommendation> recommendations,
            @Schema(requiredMode = REQUIRED, description = "Recovery candidates of the user now") int candidateCount,
            @Schema(requiredMode = REQUIRED, description = "Candidates the Coach looked at in detail")
            int reviewedCount) {
    }
}
