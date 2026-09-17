package com.dayflow.api.ai.planning;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.ai.CoachFact;
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
 * Planning Coach request and response. Suggestions are proposals only: each one is applied separately by the client
 * with the normal Day API (PATCH /days/{id}, PUT /days/{id}/schedule, POST /days) after the user confirms.
 */
public final class PlanningCoachDtos {

    private PlanningCoachDtos() {
    }

    /**
     * @param goalId    a CALENDAR WEEK Goal (its canonical week is planned) or a PERIOD Goal
     * @param weekStart PERIOD Goal only: the Monday of the week to plan (clipped to the Goal range); null plans the
     *                  week containing today (or the Goal start). Ignored for a WEEK Goal.
     */
    public record PlanningCoachRequest(
            @Schema(requiredMode = REQUIRED) @NotNull UUID goalId,
            @Schema(types = {"string", "null"}, format = "date") LocalDate weekStart,
            @Schema(requiredMode = REQUIRED, example = "Asia/Seoul") @NotBlank @Size(max = 64) String timezone) {
    }

    public enum PlanningSuggestionType {
        /** Look at the Day; nothing to apply. */
        OPEN_DAY,
        /** PATCH plannedDate (an existing time placement keeps its time). */
        SET_DATE,
        /** PATCH priority. */
        SET_PRIORITY,
        /** PUT schedule with the same duration at another date/time (only for Days that already have a placement). */
        SET_SCHEDULE
    }

    public record PlanningCoachObservation(
            @Schema(requiredMode = REQUIRED) String message,
            @Schema(requiredMode = REQUIRED) List<CoachFact> evidence) {
    }

    public record PlanningDaySuggestion(
            @Schema(requiredMode = REQUIRED) UUID dayId,
            @Schema(requiredMode = REQUIRED) String dayTitle,
            @Schema(requiredMode = REQUIRED) PlanningSuggestionType type,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date",
                    description = "SET_DATE / SET_SCHEDULE: the date inside the planned period")
            LocalDate targetDate,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, example = "19:00",
                    description = "SET_SCHEDULE: local start time HH:mm")
            String startTime,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, example = "20:00",
                    description = "SET_SCHEDULE: local end time HH:mm (the Day's current duration kept)")
            String endTime,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, allowableValues = {"NONE", "LOW", "MEDIUM", "HIGH"},
                    description = "SET_PRIORITY only")
            DayPriority priority,
            @Schema(requiredMode = REQUIRED) String reason,
            @Schema(requiredMode = REQUIRED) List<CoachFact> evidence) {
    }

    /** A new Day to consider; created only if the user confirms, under the planned Goal. */
    public record PlanningDayProposal(
            @Schema(requiredMode = REQUIRED) String title,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date",
                    description = "A date inside the planned period, or null to leave it undecided")
            LocalDate proposedDate,
            @Schema(requiredMode = REQUIRED) DayPriority priority,
            @Schema(requiredMode = REQUIRED) String reason,
            @Schema(requiredMode = REQUIRED) List<CoachFact> evidence) {
    }

    public record PlanningCoachResponse(
            @Schema(requiredMode = REQUIRED) Instant generatedAt,
            @Schema(requiredMode = REQUIRED) UUID goalId,
            @Schema(requiredMode = REQUIRED) LocalDate targetStart,
            @Schema(requiredMode = REQUIRED) LocalDate targetEnd,
            @Schema(requiredMode = REQUIRED) String headline,
            @Schema(requiredMode = REQUIRED) String summary,
            @Schema(requiredMode = REQUIRED, description = "At most 3") List<PlanningCoachObservation> observations,
            @Schema(requiredMode = REQUIRED, description = "At most 5, one per Day; never applied automatically")
            List<PlanningDaySuggestion> suggestions,
            @Schema(requiredMode = REQUIRED, description = "At most 2; only with a concrete Review TRY behind them")
            List<PlanningDayProposal> proposals,
            @Schema(requiredMode = REQUIRED, description = "Facts DayFlow computed for this period") List<CoachFact> facts) {
    }
}
