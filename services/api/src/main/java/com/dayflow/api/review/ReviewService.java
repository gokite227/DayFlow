package com.dayflow.api.review;

import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.day.DayDtos.CreateDayRequest;
import com.dayflow.api.day.DayDtos.DayResponse;
import com.dayflow.api.day.DayRepository;
import com.dayflow.api.day.DayService;
import com.dayflow.api.review.ReviewDtos.ConvertReviewItemResponse;
import com.dayflow.api.review.ReviewDtos.ReviewItemRequest;
import com.dayflow.api.review.ReviewDtos.ReviewResponse;
import com.dayflow.api.review.ReviewDtos.SaveReviewRequest;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** KPT reviews (REV-003) and Try → Day conversion (REV-004). */
@Service
@Transactional
public class ReviewService {

    private final ReviewRepository reviews;
    private final DayService dayService;
    private final DayRepository days;

    public ReviewService(ReviewRepository reviews, DayService dayService, DayRepository days) {
        this.reviews = reviews;
        this.dayService = dayService;
        this.days = days;
    }

    @Transactional(readOnly = true)
    public ReviewResponse get(ReviewType type, LocalDate periodStart) {
        periodEnd(type, periodStart);
        return reviews.findByTypeAndPeriodStart(type, periodStart)
                .map(ReviewResponse::from)
                .orElseThrow(() -> new ApiException(ErrorCode.REVIEW_NOT_FOUND,
                        "No " + type + " review starting " + periodStart + "."));
    }

    /** Creates or replaces the review of a period, with optimistic concurrency on expectedVersion. */
    public ReviewResponse save(ReviewType type, LocalDate periodStart, SaveReviewRequest request) {
        LocalDate periodEnd = periodEnd(type, periodStart);
        Review review = reviews.findByTypeAndPeriodStart(type, periodStart).orElse(null);
        Long currentVersion = review == null ? null : review.getVersion();
        if (!Objects.equals(currentVersion, request.expectedVersion())) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT,
                    "The review was changed by another request. Reload and try again.", "expectedVersion");
        }
        if (review == null) {
            review = new Review(type, periodStart, periodEnd);
        }

        review.setRating(request.rating());
        review.setCompleted(request.completed());
        replaceItems(review, request.items());
        return ReviewResponse.from(reviews.saveAndFlush(review));
    }

    /**
     * Turns a Try item into a Day (REV-004). Idempotent: if the item already produced a Day that
     * still exists, that Day is returned and nothing new is created.
     */
    public ConvertReviewItemResponse convertTry(UUID itemId, CreateDayRequest request) {
        Review review = reviews.findByItems_Id(itemId)
                .orElseThrow(() -> new ApiException(ErrorCode.REVIEW_ITEM_NOT_FOUND,
                        "Review item " + itemId + " was not found."));
        ReviewItem item = review.getItems().stream()
                .filter(candidate -> candidate.getId().equals(itemId))
                .findFirst()
                .orElseThrow();
        if (item.getKind() != ReviewItemKind.TRY) {
            throw new ApiException(ErrorCode.REVIEW_ITEM_NOT_TRY, "Only Try items can become a Day.", "itemId");
        }

        if (item.getConvertedDayId() != null && days.existsById(item.getConvertedDayId())) {
            return new ConvertReviewItemResponse(ReviewResponse.from(review), dayService.get(item.getConvertedDayId()));
        }

        DayResponse day = dayService.create(request);
        item.setConvertedDayId(day.id());
        return new ConvertReviewItemResponse(ReviewResponse.from(reviews.saveAndFlush(review)), day);
    }

    private static LocalDate periodEnd(ReviewType type, LocalDate periodStart) {
        LocalDate end = type.periodEnd(periodStart);
        if (end == null) {
            throw new ApiException(ErrorCode.INVALID_REVIEW_PERIOD,
                    periodStart + " is not the first day of a " + type + " period.", "periodStart");
        }
        return end;
    }

    private static void replaceItems(Review review, List<ReviewItemRequest> requested) {
        Map<UUID, ReviewItem> existing = review.getItems().stream()
                .collect(Collectors.toMap(ReviewItem::getId, Function.identity()));
        Set<UUID> seen = new HashSet<>();
        List<ReviewItem> next = new ArrayList<>();

        for (int index = 0; index < requested.size(); index++) {
            ReviewItemRequest itemRequest = requested.get(index);
            String content = itemRequest.content().strip();
            ReviewItem item;
            if (itemRequest.id() == null) {
                item = new ReviewItem(itemRequest.kind(), content, index);
            } else {
                item = existing.get(itemRequest.id());
                if (item == null || !seen.add(itemRequest.id())) {
                    throw new ApiException(ErrorCode.VALIDATION_ERROR,
                            "Item " + itemRequest.id() + " does not belong to this review.", "items[" + index + "].id");
                }
                item.update(itemRequest.kind(), content, index);
            }
            next.add(item);
        }

        review.getItems().clear();
        review.getItems().addAll(next);
    }
}
