package com.dayflow.api.day;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.day.DayTagDtos.DayTagResponse;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Request/response bodies of /api/v1/days, matching Day and DaySchedule in packages/domain. */
public final class DayDtos {

    private DayDtos() {
    }

    public record CreateDayRequest(
            @Schema(types = {"string", "null"}, format = "uuid",
                    description = "null or omitted for a Day without a Goal; otherwise a WEEK Goal (DAY-001)")
            UUID goalId,
            @NotBlank @Size(max = 200) String title,
            @NotNull DayStatus status,
            @NotNull DayPriority priority,
            @NotNull @Positive Integer estimatedMinutes,
            @Schema(types = {"string", "null"}, format = "date",
                    description = "null or omitted when the date is not decided yet")
            LocalDate plannedDate,
            @NotNull DayPlanningMode planningMode,
            @NotNull Boolean coreDay,
            @Schema(description = "Day Tag ids; omitted means no Tags (at most 10, DAY-005)")
            @Size(max = DayTagService.MAX_TAGS_PER_DAY) List<UUID> tagIds) {
    }

    /**
     * PATCH body. Omitted fields stay unchanged. {@code "plannedDate": null} clears
     * the date (and removes the schedule) and {@code "goalId": null} removes the Goal link,
     * which is why presence is tracked.
     */
    public static class UpdateDayRequest {

        @Schema(types = {"string", "null"}, format = "uuid",
                description = "Omit to keep the Goal; null removes the Goal link (DAY-001).")
        private UUID goalId;
        private boolean goalIdProvided;

        @Size(max = 200)
        @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
        private String title;

        private DayStatus status;

        private DayPriority priority;

        @Positive
        private Integer estimatedMinutes;

        @Schema(types = {"string", "null"}, format = "date",
                description = "Omit to keep the date; null clears it and removes the schedule.")
        private LocalDate plannedDate;
        private boolean plannedDateProvided;

        private DayPlanningMode planningMode;
        private Boolean coreDay;

        @Schema(description = "Omit to keep the Tags; a list replaces them (at most 10, DAY-005).")
        @Size(max = DayTagService.MAX_TAGS_PER_DAY)
        private List<UUID> tagIds;

        @NotNull
        @PositiveOrZero
        private Long version;

        public boolean hasGoalId() {
            return goalIdProvided;
        }

        public boolean hasPlannedDate() {
            return plannedDateProvided;
        }

        public boolean hasAnyChange() {
            return goalIdProvided || title != null || status != null || priority != null
                    || estimatedMinutes != null || plannedDateProvided || planningMode != null || coreDay != null
                    || tagIds != null;
        }

        public UUID getGoalId() {
            return goalId;
        }

        public void setGoalId(UUID goalId) {
            this.goalId = goalId;
            this.goalIdProvided = true;
        }

        public String getTitle() {
            return title;
        }

        public void setTitle(String title) {
            this.title = title;
        }

        public DayStatus getStatus() {
            return status;
        }

        public void setStatus(DayStatus status) {
            this.status = status;
        }

        public DayPriority getPriority() {
            return priority;
        }

        public void setPriority(DayPriority priority) {
            this.priority = priority;
        }

        public Integer getEstimatedMinutes() {
            return estimatedMinutes;
        }

        public void setEstimatedMinutes(Integer estimatedMinutes) {
            this.estimatedMinutes = estimatedMinutes;
        }

        public LocalDate getPlannedDate() {
            return plannedDate;
        }

        public void setPlannedDate(LocalDate plannedDate) {
            this.plannedDate = plannedDate;
            this.plannedDateProvided = true;
        }

        public DayPlanningMode getPlanningMode() {
            return planningMode;
        }

        public void setPlanningMode(DayPlanningMode planningMode) {
            this.planningMode = planningMode;
        }

        public Boolean getCoreDay() {
            return coreDay;
        }

        public void setCoreDay(Boolean coreDay) {
            this.coreDay = coreDay;
        }

        public List<UUID> getTagIds() {
            return tagIds;
        }

        public void setTagIds(List<UUID> tagIds) {
            this.tagIds = tagIds;
        }

        public Long getVersion() {
            return version;
        }

        public void setVersion(Long version) {
            this.version = version;
        }
    }

    /**
     * PUT /days/{dayId}/schedule body. expectedVersion must always be present: null to
     * create a schedule, the current schedule version to replace it. An omitted field is
     * rejected by Jackson (required creator property), while an explicit null is accepted.
     */
    public record SetDayScheduleRequest(
            @NotNull OffsetDateTime startAt,
            @NotNull OffsetDateTime endAt,
            @NotBlank @Size(max = 64) String timezone,
            @JsonProperty(required = true)
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = {"integer", "null"}, format = "int64",
                    description = "null to create a schedule; the current schedule version to replace it")
            @PositiveOrZero Long expectedVersion) {
    }

    /** startAt/endAt are rendered with the offset of the schedule's timezone. */
    public record DayScheduleResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) UUID dayId,
            @Schema(requiredMode = REQUIRED) OffsetDateTime startAt,
            @Schema(requiredMode = REQUIRED) OffsetDateTime endAt,
            @Schema(requiredMode = REQUIRED) String timezone,
            @Schema(requiredMode = REQUIRED) Instant createdAt,
            @Schema(requiredMode = REQUIRED) Instant updatedAt,
            @Schema(requiredMode = REQUIRED) long version) {

        static DayScheduleResponse from(DaySchedule schedule) {
            return new DayScheduleResponse(schedule.getId(), schedule.getDayId(),
                    schedule.getStartAt().atZone(schedule.zoneId()).toOffsetDateTime(),
                    schedule.getEndAt().atZone(schedule.zoneId()).toOffsetDateTime(),
                    schedule.getTimezone(), schedule.getCreatedAt(), schedule.getUpdatedAt(), schedule.getVersion());
        }
    }

    /**
     * A Day with its optional schedule (DayWithSchedule in packages/domain). Every field
     * is always serialized; goalId, plannedDate and schedule may be null. Tags are sent as
     * objects so lists can render them without a second request.
     */
    public record DayResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "uuid",
                    description = "null when the Day has no Goal (DAY-001)")
            UUID goalId,
            @Schema(requiredMode = REQUIRED) String title,
            @Schema(requiredMode = REQUIRED) DayStatus status,
            @Schema(requiredMode = REQUIRED) DayPriority priority,
            @Schema(requiredMode = REQUIRED) int estimatedMinutes,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date",
                    description = "null when the date is not decided yet")
            LocalDate plannedDate,
            @Schema(requiredMode = REQUIRED) DayPlanningMode planningMode,
            @Schema(requiredMode = REQUIRED) boolean coreDay,
            @Schema(requiredMode = REQUIRED) List<DayTagResponse> tags,
            @Schema(requiredMode = REQUIRED) Instant createdAt,
            @Schema(requiredMode = REQUIRED) Instant updatedAt,
            @Schema(requiredMode = REQUIRED) long version,
            @Schema(requiredMode = REQUIRED, types = {"object", "null"},
                    description = "null when the Day has no time placement")
            DayScheduleResponse schedule) {

        static DayResponse from(Day day, DaySchedule schedule) {
            return new DayResponse(day.getId(), day.getGoalId(), day.getTitle(), day.getStatus(), day.getPriority(),
                    day.getEstimatedMinutes(), day.getPlannedDate(), day.getPlanningMode(), day.isCoreDay(),
                    day.getTags().stream().map(DayTagResponse::from).toList(),
                    day.getCreatedAt(), day.getUpdatedAt(), day.getVersion(),
                    schedule == null ? null : DayScheduleResponse.from(schedule));
        }
    }
}
