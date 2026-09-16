package com.dayflow.api.goal;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Request/response bodies of /api/v1/goals, matching Goal in packages/domain. */
public final class GoalDtos {

    private GoalDtos() {
    }

    public record CreateGoalRequest(
            @Schema(types = {"string", "null"}, format = "uuid",
                    description = "null or omitted for YEAR Goals; the parent Goal id otherwise")
            UUID parentGoalId,
            @NotNull GoalType type,
            @NotBlank @Size(max = 200) String title,
            @NotNull @Size(max = 2000) String why,
            @NotNull LocalDate startDate,
            @NotNull LocalDate endDate,
            @NotNull @PositiveOrZero Integer priority,
            @NotNull ProgressPolicy progressPolicy) {
    }

    /**
     * PATCH body. Omitted fields stay unchanged. A class with setters is used so an
     * explicit {@code "parentGoalId": null} can be told apart from an omitted field.
     */
    public static class UpdateGoalRequest {

        @Schema(types = {"string", "null"}, format = "uuid",
                description = "Omit to keep the parent. null is only valid for YEAR Goals.")
        private UUID parentGoalId;
        private boolean parentGoalIdProvided;

        @Size(max = 200)
        @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
        private String title;

        @Size(max = 2000)
        private String why;

        private LocalDate startDate;
        private LocalDate endDate;

        @PositiveOrZero
        private Integer priority;

        private ProgressPolicy progressPolicy;

        @NotNull
        @PositiveOrZero
        private Long version;

        public boolean hasParentGoalId() {
            return parentGoalIdProvided;
        }

        public boolean hasAnyChange() {
            return parentGoalIdProvided || title != null || why != null || startDate != null
                    || endDate != null || priority != null || progressPolicy != null;
        }

        public UUID getParentGoalId() {
            return parentGoalId;
        }

        public void setParentGoalId(UUID parentGoalId) {
            this.parentGoalId = parentGoalId;
            this.parentGoalIdProvided = true;
        }

        public String getTitle() {
            return title;
        }

        public void setTitle(String title) {
            this.title = title;
        }

        public String getWhy() {
            return why;
        }

        public void setWhy(String why) {
            this.why = why;
        }

        public LocalDate getStartDate() {
            return startDate;
        }

        public void setStartDate(LocalDate startDate) {
            this.startDate = startDate;
        }

        public LocalDate getEndDate() {
            return endDate;
        }

        public void setEndDate(LocalDate endDate) {
            this.endDate = endDate;
        }

        public Integer getPriority() {
            return priority;
        }

        public void setPriority(Integer priority) {
            this.priority = priority;
        }

        public ProgressPolicy getProgressPolicy() {
            return progressPolicy;
        }

        public void setProgressPolicy(ProgressPolicy progressPolicy) {
            this.progressPolicy = progressPolicy;
        }

        public Long getVersion() {
            return version;
        }

        public void setVersion(Long version) {
            this.version = version;
        }
    }

    /** Every field is always serialized; parentGoalId is null for YEAR Goals. */
    public record GoalResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "uuid",
                    description = "null for YEAR Goals")
            UUID parentGoalId,
            @Schema(requiredMode = REQUIRED) GoalType type,
            @Schema(requiredMode = REQUIRED) String title,
            @Schema(requiredMode = REQUIRED) String why,
            @Schema(requiredMode = REQUIRED) LocalDate startDate,
            @Schema(requiredMode = REQUIRED) LocalDate endDate,
            @Schema(requiredMode = REQUIRED) int priority,
            @Schema(requiredMode = REQUIRED) ProgressPolicy progressPolicy,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "uuid",
                    description = "The earlier-period Goal this Goal continues (REC-003), or null")
            UUID continuedFromGoalId,
            @Schema(requiredMode = REQUIRED) Instant createdAt,
            @Schema(requiredMode = REQUIRED) Instant updatedAt,
            @Schema(requiredMode = REQUIRED) long version) {

        public static GoalResponse from(Goal goal) {
            return new GoalResponse(goal.getId(), goal.getParentGoalId(), goal.getType(), goal.getTitle(),
                    goal.getWhy(), goal.getStartDate(), goal.getEndDate(), goal.getPriority(),
                    goal.getProgressPolicy(), goal.getContinuedFromGoalId(), goal.getCreatedAt(),
                    goal.getUpdatedAt(), goal.getVersion());
        }
    }
}
