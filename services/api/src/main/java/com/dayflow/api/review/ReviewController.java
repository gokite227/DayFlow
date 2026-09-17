package com.dayflow.api.review;

import com.dayflow.api.common.ProblemResponse;
import com.dayflow.api.day.DayDtos.CreateDayRequest;
import com.dayflow.api.review.ReviewDtos.ConvertReviewItemResponse;
import com.dayflow.api.review.ReviewDtos.ReviewArchivePage;
import com.dayflow.api.review.ReviewDtos.ReviewResponse;
import com.dayflow.api.review.ReviewDtos.SaveReviewRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@ApiResponse(responseCode = "400", description = "Invalid request or period",
        content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    /**
     * Review archive: the current user's saved reviews, newest reviewed period first. type filters by period
     * type; q searches KPT lines and linked Goal titles (case-insensitive, trimmed). Pages start at 0.
     */
    @GetMapping("/reviews")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "listReviews")
    public ReviewArchivePage list(
            @RequestParam(required = false) ReviewType type,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return reviewService.archive(type, q, page, size);
    }

    /** periodStart is the first date of the period (e.g. the week start, the 1st of the month). */
    @GetMapping("/reviews/{type}/{periodStart}")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "getReview")
    @ApiResponse(responseCode = "404", description = "No review saved for this period (REVIEW_NOT_FOUND)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public ReviewResponse get(
            @PathVariable ReviewType type,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart) {
        return reviewService.get(type, periodStart);
    }

    @PutMapping("/reviews/{type}/{periodStart}")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "saveReview")
    @ApiResponse(responseCode = "409", description = "expectedVersion does not match (VERSION_CONFLICT)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public ReviewResponse save(
            @PathVariable ReviewType type,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart,
            @Valid @RequestBody SaveReviewRequest request) {
        return reviewService.save(type, periodStart, request);
    }

    /** Creates a Day from a Try item. Repeating the call returns the already created Day. */
    @PostMapping("/review-items/{itemId}/convert")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "convertReviewItem")
    @ApiResponse(responseCode = "404", description = "Review item not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public ConvertReviewItemResponse convert(@PathVariable UUID itemId, @Valid @RequestBody CreateDayRequest request) {
        return reviewService.convertTry(itemId, request);
    }
}
