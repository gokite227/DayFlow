package com.dayflow.api.ai.review;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.review.ReviewType;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Review Coach request and response. The response is a KPT draft only: nothing is saved, and applying it just fills
 * the Review editor; the user saves through PUT /api/v1/reviews/{type}/{periodStart}.
 */
public final class ReviewCoachDtos {

    private ReviewCoachDtos() {
    }

    /**
     * Same period addressing as the Review API: {@code periodStart} must be the first date of a {@code type} period
     * (validated with {@link ReviewType#periodEnd}); the server derives the end.
     */
    public record ReviewCoachRequest(
            @Schema(requiredMode = REQUIRED) @NotNull ReviewType type,
            @Schema(requiredMode = REQUIRED) @NotNull LocalDate periodStart,
            @Schema(requiredMode = REQUIRED, example = "Asia/Seoul") @NotBlank @Size(max = 64) String timezone) {
    }

    /** A backend-computed fact the draft is based on; the label already contains the numbers. */
    public record ReviewEvidence(
            @Schema(requiredMode = REQUIRED, example = "CORE_COMPLETION") String key,
            @Schema(requiredMode = REQUIRED, example = "핵심 Day 4개 중 3개 완료") String label) {
    }

    public record ReviewHighlight(
            @Schema(requiredMode = REQUIRED) String message,
            @Schema(requiredMode = REQUIRED) List<ReviewEvidence> evidence) {
    }

    /** One suggested KPT line: {@code text} goes into the editor, {@code reason} explains it. */
    public record ReviewDraftItem(
            @Schema(requiredMode = REQUIRED) String text,
            @Schema(requiredMode = REQUIRED) String reason,
            @Schema(requiredMode = REQUIRED) List<ReviewEvidence> evidence) {
    }

    public record ReviewCoachResponse(
            @Schema(requiredMode = REQUIRED) Instant generatedAt,
            @Schema(requiredMode = REQUIRED) ReviewType type,
            @Schema(requiredMode = REQUIRED) LocalDate periodStart,
            @Schema(requiredMode = REQUIRED) LocalDate periodEnd,
            @Schema(requiredMode = REQUIRED) String headline,
            @Schema(requiredMode = REQUIRED) String summary,
            @Schema(requiredMode = REQUIRED, description = "At most 3") List<ReviewHighlight> highlights,
            @Schema(requiredMode = REQUIRED, description = "KEEP drafts, at most 3") List<ReviewDraftItem> keep,
            @Schema(requiredMode = REQUIRED, description = "PROBLEM drafts, at most 3") List<ReviewDraftItem> problem,
            @JsonProperty("try")
            @Schema(name = "try", requiredMode = REQUIRED, description = "TRY drafts, at most 3") List<ReviewDraftItem> tryItems,
            @Schema(requiredMode = REQUIRED,
                    description = "Facts DayFlow computed for this period (shown so the user can check the draft)")
            List<ReviewEvidence> facts) {
    }
}
