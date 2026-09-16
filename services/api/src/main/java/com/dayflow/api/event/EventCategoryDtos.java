package com.dayflow.api.event;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

/** Request/response bodies of /api/v1/event-categories (EVT-006). */
public final class EventCategoryDtos {

    /** Checked on the trimmed name, so the limit matches the stored value. */
    public static final int MAX_NAME_LENGTH = 30;

    private EventCategoryDtos() {
    }

    public record CreateEventCategoryRequest(
            @NotBlank @Size(max = MAX_NAME_LENGTH) String name,
            @NotBlank @Schema(description = "One of the Event palette colors") String color,
            @Schema(types = {"integer", "null"}, format = "int32",
                    description = "Omitted or null puts the Category at the end of the list")
            @PositiveOrZero Integer sortOrder) {
    }

    /** PATCH body: omitted fields stay unchanged. */
    public static class UpdateEventCategoryRequest {

        @Size(max = MAX_NAME_LENGTH)
        @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
        private String name;

        private String color;

        @PositiveOrZero
        private Integer sortOrder;

        @NotNull
        @PositiveOrZero
        private Long version;

        public boolean hasAnyChange() {
            return name != null || color != null || sortOrder != null;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getColor() {
            return color;
        }

        public void setColor(String color) {
            this.color = color;
        }

        public Integer getSortOrder() {
            return sortOrder;
        }

        public void setSortOrder(Integer sortOrder) {
            this.sortOrder = sortOrder;
        }

        public Long getVersion() {
            return version;
        }

        public void setVersion(Long version) {
            this.version = version;
        }
    }

    public record EventCategoryResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED) String color,
            @Schema(requiredMode = REQUIRED) int sortOrder,
            @Schema(requiredMode = REQUIRED) Instant createdAt,
            @Schema(requiredMode = REQUIRED) Instant updatedAt,
            @Schema(requiredMode = REQUIRED) long version) {

        static EventCategoryResponse from(EventCategory category) {
            return new EventCategoryResponse(category.getId(), category.getName(), category.getColor(),
                    category.getSortOrder(), category.getCreatedAt(), category.getUpdatedAt(), category.getVersion());
        }
    }

    /** The part of a Category an Event or occurrence carries, so lists need no second request. */
    public record EventCategorySummary(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED) String color) {

        static EventCategorySummary from(EventCategory category) {
            return category == null ? null
                    : new EventCategorySummary(category.getId(), category.getName(), category.getColor());
        }
    }
}
