package com.dayflow.api.recovery;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.day.DayDtos.DayResponse;
import com.dayflow.api.goal.GoalDtos.GoalResponse;
import com.dayflow.api.goal.GoalType;
import com.dayflow.api.recovery.RecoveryDtos.VersionedIdRequest;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Request/response bodies of /api/v1/recovery/carry-over/* (REC-003, REC-004). */
public final class CarryOverDtos {

    private CarryOverDtos() {
    }

    /** The three ways to continue a missed Day in a later period. */
    public enum CarryOverMode {
        /** "이 Day만 넘기기": a new Day under an existing WEEK Goal of the target date. */
        DAY_ONLY,
        /** "계획 구조와 함께 이어가기": reuse or create the Goals of the target periods, then the new Days. */
        WITH_PLAN,
        /** "Goal 연결 없이 넘기기": a new Day without a Goal. */
        WITHOUT_GOAL
    }

    /** How one Goal level of the target date is provided (WITH_PLAN). */
    public enum CarryOverLevelAction {
        /** The target date is still inside the source Goal's period: that Goal is used as it is. */
        KEEP_SOURCE,
        /** An existing Goal of the target period is used. */
        REUSE,
        /** A new Goal of the target period is created, continuing the source Goal. */
        CREATE,
        /** Several existing Goals could be reused: the user has to pick one or choose CREATE. */
        CHOOSE
    }

    /** Why a Day of the source WEEK Goal cannot be carried along. */
    public enum CarryOverDayExclusion {
        /** DONE or SKIPPED: finished Days are not copied. */
        FINISHED,
        /** A Day already continues this Day in a later period. */
        ALREADY_CARRIED
    }

    /** WITH_PLAN: the user's choice for one level. Omitted levels use the suggestion. */
    public record CarryOverLevelChoice(
            @NotNull GoalType type,
            @Schema(types = {"string", "null"}, format = "uuid", description = "Reuse this existing Goal")
            UUID goalId,
            @Schema(description = "true to create a new Goal instead of reusing one")
            boolean create) {
    }

    /** POST /recovery/carry-over/preview. Reads only; nothing is changed. */
    public record CarryOverPreviewRequest(
            @NotNull LocalDate localDate,
            @NotNull UUID sourceDayId,
            @NotNull LocalDate targetDate,
            @NotNull CarryOverMode mode,
            @Schema(types = {"string", "null"}, format = "uuid",
                    description = "DAY_ONLY: the chosen WEEK Goal of the target date; null uses the suggestion")
            UUID targetWeekGoalId,
            @Schema(description = "WITH_PLAN: choices per Goal level") @Size(max = 4)
            List<@Valid CarryOverLevelChoice> levels,
            @Schema(description = "WITH_PLAN: the Days of the source WEEK Goal to carry along; null selects only the source Day")
            @Size(max = 100) List<UUID> dayIds) {
    }

    /**
     * POST /recovery/carry-over/apply: the previewed plan with the versions the user saw. Any stale
     * version returns 409 and nothing is applied.
     */
    public record ApplyCarryOverRequest(
            @NotNull LocalDate localDate,
            @NotNull UUID sourceDayId,
            @NotNull LocalDate targetDate,
            @NotNull CarryOverMode mode,
            @Schema(types = {"string", "null"}, format = "uuid", description = "DAY_ONLY: the WEEK Goal to use")
            UUID targetWeekGoalId,
            @Size(max = 4) List<@Valid CarryOverLevelChoice> levels,
            @Schema(description = "The Days to carry over (the source Day included) with their previewed versions")
            @NotEmpty @Size(max = 100) List<@Valid VersionedIdRequest> days,
            @Schema(description = "WITH_PLAN: the source Goal path and reused Goals with their previewed versions")
            @Size(max = 10) List<@Valid VersionedIdRequest> goals) {
    }

    public record CarryOverLevelPreview(
            @Schema(requiredMode = REQUIRED) GoalType type,
            @Schema(requiredMode = REQUIRED) LocalDate startDate,
            @Schema(requiredMode = REQUIRED) LocalDate endDate,
            @Schema(requiredMode = REQUIRED, types = {"object", "null"}, description = "The Goal of this level above the source Day")
            GoalResponse sourceGoal,
            @Schema(requiredMode = REQUIRED) CarryOverLevelAction action,
            @Schema(requiredMode = REQUIRED, types = {"object", "null"},
                    description = "KEEP_SOURCE/REUSE: the Goal that will be used")
            GoalResponse goal,
            @Schema(requiredMode = REQUIRED, description = "Existing Goals of the target period that could be reused")
            List<GoalResponse> candidates,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, description = "CREATE: the new Goal's title")
            String newTitle) {
    }

    public record CarryOverDayPreview(
            @Schema(requiredMode = REQUIRED) DayResponse day,
            @Schema(requiredMode = REQUIRED) boolean selected,
            @Schema(requiredMode = REQUIRED) boolean selectable,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, allowableValues = {"FINISHED", "ALREADY_CARRIED"})
            CarryOverDayExclusion exclusion) {
    }

    public record CarryOverPreviewResponse(
            @Schema(requiredMode = REQUIRED) LocalDate targetDate,
            @Schema(requiredMode = REQUIRED) CarryOverMode mode,
            @Schema(requiredMode = REQUIRED) DayResponse sourceDay,
            @Schema(requiredMode = REQUIRED, description = "YEAR → WEEK Goals above the source Day")
            List<GoalResponse> sourceGoalPath,
            @Schema(requiredMode = REQUIRED, description = "Existing WEEK Goals containing the target date")
            List<GoalResponse> targetWeekGoals,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "uuid",
                    description = "DAY_ONLY: the WEEK Goal that will be used, or null when none is available")
            UUID targetWeekGoalId,
            @Schema(requiredMode = REQUIRED, description = "WITH_PLAN: YEAR → WEEK levels of the target date")
            List<CarryOverLevelPreview> levels,
            @Schema(requiredMode = REQUIRED, description = "Days of the source WEEK Goal; DAY_ONLY/WITHOUT_GOAL list only the source")
            List<CarryOverDayPreview> days,
            @Schema(requiredMode = REQUIRED, description = "false while a Goal still has to be chosen or is missing")
            boolean ready) {
    }

    public record CarriedDayResponse(
            @Schema(requiredMode = REQUIRED) DayResponse source,
            @Schema(requiredMode = REQUIRED) DayResponse destination) {
    }

    public record ApplyCarryOverResponse(
            @Schema(requiredMode = REQUIRED) UUID eventId,
            @Schema(requiredMode = REQUIRED) Instant appliedAt,
            @Schema(requiredMode = REQUIRED) List<GoalResponse> createdGoals,
            @Schema(requiredMode = REQUIRED) List<CarriedDayResponse> days) {
    }
}
