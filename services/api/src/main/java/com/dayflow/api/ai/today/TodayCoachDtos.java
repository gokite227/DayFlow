package com.dayflow.api.ai.today;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.day.DayPriority;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Request and response of the Today Coach. The response is DayFlow's validated view of the model answer: every Day id
 * belongs to the current user, and suggestions are only proposals the client applies through the normal Day API.
 */
public final class TodayCoachDtos {

    private TodayCoachDtos() {
    }

    /** The user's own "today" (the server does not guess the user's timezone). */
    public record TodayCoachRequest(
            @Schema(requiredMode = REQUIRED) @NotNull LocalDate localDate,
            @Schema(requiredMode = REQUIRED, example = "Asia/Seoul") @NotBlank @Size(max = 64) String timezone) {
    }

    public enum CoachEvidenceType {
        DAY,
        GOAL,
        REVIEW,
        METRIC
    }

    public enum CoachSuggestionType {
        /** Text only, nothing to apply. */
        ADVICE_ONLY,
        /** Open a Day to look at it. */
        OPEN_DAY,
        /** Proposes PATCH /days/{id} plannedDate (applied only after the user confirms). */
        RESCHEDULE_DAY,
        /** Proposes PATCH /days/{id} priority (applied only after the user confirms). */
        SET_PRIORITY
    }

    public record TodayCoachResponse(
            @Schema(requiredMode = REQUIRED) Instant generatedAt,
            @Schema(requiredMode = REQUIRED) LocalDate localDate,
            @Schema(requiredMode = REQUIRED) String headline,
            @Schema(requiredMode = REQUIRED) String summary,
            @Schema(requiredMode = REQUIRED, description = "At most 3 of today's unfinished Days")
            List<CoachPriority> priorities,
            @Schema(requiredMode = REQUIRED, description = "At most 3, each with at least one evidence")
            List<CoachObservation> observations,
            @Schema(requiredMode = REQUIRED, description = "At most 3; never applied automatically")
            List<CoachSuggestion> suggestions) {
    }

    public record CoachPriority(
            @Schema(requiredMode = REQUIRED) UUID dayId,
            @Schema(requiredMode = REQUIRED) String dayTitle,
            @Schema(requiredMode = REQUIRED) String reason) {
    }

    public record CoachObservation(
            @Schema(requiredMode = REQUIRED) String message,
            @Schema(requiredMode = REQUIRED) List<CoachEvidence> evidence) {
    }

    /**
     * @param id    Day/Goal/Review UUID, or the metric key for METRIC
     * @param label what the evidence is, e.g. a Day title or "최근 7일 완료 3/5"
     */
    public record CoachEvidence(
            @Schema(requiredMode = REQUIRED) CoachEvidenceType type,
            @Schema(requiredMode = REQUIRED) String id,
            @Schema(requiredMode = REQUIRED) String label) {
    }

    public record CoachSuggestion(
            @Schema(requiredMode = REQUIRED) CoachSuggestionType type,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "uuid",
                    description = "null for ADVICE_ONLY")
            UUID dayId,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, description = "null for ADVICE_ONLY")
            String dayTitle,
            @Schema(requiredMode = REQUIRED) String message,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date",
                    description = "RESCHEDULE_DAY only: today or later, inside the Day's Goal period")
            LocalDate proposedDate,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, allowableValues = {"NONE", "LOW", "MEDIUM", "HIGH"},
                    description = "SET_PRIORITY only")
            DayPriority proposedPriority) {
    }
}
