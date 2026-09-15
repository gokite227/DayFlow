package com.dayflow.api.review;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.day.DayDtos.DayResponse;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Request/response bodies of /api/v1/reviews and /api/v1/review-items. */
public final class ReviewDtos {

    private ReviewDtos() {
    }

    /**
     * PUT /reviews/{type}/{periodStart}. Replaces rating, completion and the KPT list. Items with an
     * id keep their identity (and Try conversion); items without an id are new.
     */
    public record SaveReviewRequest(
            @Schema(types = {"integer", "null"}, format = "int32", minimum = "1", maximum = "5",
                    description = "Satisfaction 1..5, or null when not rated")
            @Min(1) @Max(5) Integer rating,
            @NotNull Boolean completed,
            @NotNull @Size(max = 100) List<@Valid ReviewItemRequest> items,
            @JsonProperty(required = true)
            @Schema(requiredMode = REQUIRED, types = {"integer", "null"}, format = "int64",
                    description = "null to create the review; the current review version to replace it")
            @PositiveOrZero Long expectedVersion) {
    }

    public record ReviewItemRequest(
            @Schema(types = {"string", "null"}, format = "uuid", description = "null for a new item")
            UUID id,
            @NotNull ReviewItemKind kind,
            @NotBlank @Size(max = 1000) String content) {
    }

    public record ReviewItemResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) ReviewItemKind kind,
            @Schema(requiredMode = REQUIRED) String content,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "uuid",
                    description = "The Day created from this Try item, or null")
            UUID convertedDayId) {

        static ReviewItemResponse from(ReviewItem item) {
            return new ReviewItemResponse(item.getId(), item.getKind(), item.getContent(), item.getConvertedDayId());
        }
    }

    public record ReviewResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) ReviewType type,
            @Schema(requiredMode = REQUIRED) LocalDate periodStart,
            @Schema(requiredMode = REQUIRED) LocalDate periodEnd,
            @Schema(requiredMode = REQUIRED, types = {"integer", "null"}, format = "int32") Integer rating,
            @Schema(requiredMode = REQUIRED) boolean completed,
            @Schema(requiredMode = REQUIRED) List<ReviewItemResponse> items,
            @Schema(requiredMode = REQUIRED) Instant createdAt,
            @Schema(requiredMode = REQUIRED) Instant updatedAt,
            @Schema(requiredMode = REQUIRED) long version) {

        static ReviewResponse from(Review review) {
            return new ReviewResponse(review.getId(), review.getType(), review.getPeriodStart(),
                    review.getPeriodEnd(), review.getRating(), review.isCompleted(),
                    review.getItems().stream().map(ReviewItemResponse::from).toList(),
                    review.getCreatedAt(), review.getUpdatedAt(), review.getVersion());
        }
    }

    /** Result of converting a Try item: the review (with convertedDayId) and the Day. */
    public record ConvertReviewItemResponse(
            @Schema(requiredMode = REQUIRED) ReviewResponse review,
            @Schema(requiredMode = REQUIRED) DayResponse day) {
    }
}
