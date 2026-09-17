package com.dayflow.api.review;

import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.day.DayDtos.CreateDayRequest;
import com.dayflow.api.day.DayDtos.DayResponse;
import com.dayflow.api.day.DayRepository;
import com.dayflow.api.day.DayService;
import com.dayflow.api.goal.Goal;
import com.dayflow.api.goal.GoalRepository;
import com.dayflow.api.goal.GoalType;
import com.dayflow.api.review.ReviewDtos.ConvertReviewItemResponse;
import com.dayflow.api.review.ReviewDtos.ReviewArchiveEntry;
import com.dayflow.api.review.ReviewDtos.ReviewArchivePage;
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

/**
 * KPT reviews (REV-003) and Try → Day conversion (REV-004). Reviews, their linked Goals and converted Days
 * all belong to the current user (AUTH-003).
 */
@Service
@Transactional
public class ReviewService {

    static final int MAX_ARCHIVE_PAGE_SIZE = 50;
    static final int MAX_SEARCH_LENGTH = 100;

    private final ReviewRepository reviews;
    private final ReviewArchiveQuery archiveQuery;
    private final DayService dayService;
    private final DayRepository days;
    private final GoalRepository goals;
    private final CurrentUser currentUser;

    public ReviewService(ReviewRepository reviews, ReviewArchiveQuery archiveQuery, DayService dayService,
            DayRepository days, GoalRepository goals, CurrentUser currentUser) {
        this.reviews = reviews;
        this.archiveQuery = archiveQuery;
        this.dayService = dayService;
        this.days = days;
        this.goals = goals;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public ReviewResponse get(ReviewType type, LocalDate periodStart) {
        periodEnd(type, periodStart);
        return reviews.findByUserIdAndTypeAndPeriodStart(currentUser.id(), type, periodStart)
                .map(ReviewResponse::from)
                .orElseThrow(() -> new ApiException(ErrorCode.REVIEW_NOT_FOUND,
                        "No " + type + " review starting " + periodStart + "."));
    }

    /**
     * The current user's saved reviews, newest reviewed period first. {@code type} and {@code q} are optional
     * and combine; a blank q means no search. One extra row is read to know whether another page exists.
     */
    @Transactional(readOnly = true)
    public ReviewArchivePage archive(ReviewType type, String q, int page, int size) {
        if (page < 0) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "page must be 0 or more.", "page");
        }
        if (size < 1 || size > MAX_ARCHIVE_PAGE_SIZE) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR,
                    "size must be between 1 and " + MAX_ARCHIVE_PAGE_SIZE + ".", "size");
        }
        String search = q == null || q.isBlank() ? null : q.strip();
        if (search != null && search.length() > MAX_SEARCH_LENGTH) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR,
                    "q must be at most " + MAX_SEARCH_LENGTH + " characters.", "q");
        }
        List<ReviewArchiveEntry> rows = archiveQuery.find(currentUser.id(), type, search, page * size, size + 1);
        boolean hasNext = rows.size() > size;
        return new ReviewArchivePage(hasNext ? rows.subList(0, size) : rows, page, size, hasNext);
    }

    /** Creates or replaces the review of a period, with optimistic concurrency on expectedVersion. */
    public ReviewResponse save(ReviewType type, LocalDate periodStart, SaveReviewRequest request) {
        LocalDate periodEnd = periodEnd(type, periodStart);
        Review review = reviews.findByUserIdAndTypeAndPeriodStart(currentUser.id(), type, periodStart).orElse(null);
        Long currentVersion = review == null ? null : review.getVersion();
        if (!Objects.equals(currentVersion, request.expectedVersion())) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT,
                    "The review was changed by another request. Reload and try again.", "expectedVersion");
        }
        if (review == null) {
            review = new Review(currentUser.id(), type, periodStart, periodEnd);
        }

        review.setRating(request.rating());
        review.setCompleted(request.completed());
        replaceItems(review, request.items());
        return ReviewResponse.from(reviews.saveAndFlush(review));
    }

    /**
     * Turns a Try item into a Day (REV-004). Idempotent: if the item already produced a Day that
     * still exists, that Day is returned and nothing new is created. The Day's Goal is optional and,
     * when given, follows the Day rules (WEEK Goal, date inside its period). Independent of the
     * item's goalId/targetGoalId links.
     */
    public ConvertReviewItemResponse convertTry(UUID itemId, CreateDayRequest request) {
        Review review = reviews.findByUserIdAndItems_Id(currentUser.id(), itemId)
                .orElseThrow(() -> new ApiException(ErrorCode.REVIEW_ITEM_NOT_FOUND,
                        "Review item " + itemId + " was not found."));
        ReviewItem item = review.getItems().stream()
                .filter(candidate -> candidate.getId().equals(itemId))
                .findFirst()
                .orElseThrow();
        if (item.getKind() != ReviewItemKind.TRY) {
            throw new ApiException(ErrorCode.REVIEW_ITEM_NOT_TRY, "Only Try items can become a Day.", "itemId");
        }

        if (item.getConvertedDayId() != null && days.existsByIdAndUserId(item.getConvertedDayId(), currentUser.id())) {
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

    private void replaceItems(Review review, List<ReviewItemRequest> requested) {
        Map<UUID, ReviewItem> existing = review.getItems().stream()
                .collect(Collectors.toMap(ReviewItem::getId, Function.identity()));
        Set<UUID> seen = new HashSet<>();
        List<ReviewItem> next = new ArrayList<>();

        for (int index = 0; index < requested.size(); index++) {
            ReviewItemRequest itemRequest = requested.get(index);
            String field = "items[" + index + "]";
            String content = itemRequest.content().strip();
            ReviewItem item;
            if (itemRequest.id() == null) {
                item = new ReviewItem(itemRequest.kind(), content, index);
            } else {
                item = existing.get(itemRequest.id());
                if (item == null || !seen.add(itemRequest.id())) {
                    throw new ApiException(ErrorCode.VALIDATION_ERROR,
                            "Item " + itemRequest.id() + " does not belong to this review.", field + ".id");
                }
                item.update(itemRequest.kind(), content, index);
            }
            validateLinks(review, item, itemRequest, field);
            item.link(itemRequest.goalId(), itemRequest.targetGoalId());
            next.add(item);
        }

        review.getItems().clear();
        review.getItems().addAll(next);
    }

    /**
     * REV-003/REV-004 Goal links. Only a new or changed link is checked, so saving a rating later
     * never fails because an already linked Goal's period was edited afterwards.
     * - goalId: an overlapping PERIOD Goal, or a CALENDAR Goal of the review's level.
     * - targetGoalId: TRY only, a Goal of the review's level that is still ahead after the period.
     */
    private void validateLinks(Review review, ReviewItem item, ReviewItemRequest request, String field) {
        GoalType level = review.getType().goalType();

        UUID goalId = request.goalId();
        if (goalId != null && !goalId.equals(item.getGoalId())) {
            Goal goal = goals.findByIdAndUserId(goalId, currentUser.id()).orElse(null);
            boolean overlapsPeriod = goal != null
                    && !goal.getStartDate().isAfter(review.getPeriodEnd())
                    && !goal.getEndDate().isBefore(review.getPeriodStart());
            boolean validSource = goal != null && overlapsPeriod
                    && (goal.isPeriod() || goal.isCalendar() && goal.getType() == level);
            if (!validSource) {
                throw new ApiException(ErrorCode.INVALID_REVIEW_GOAL,
                        "A review line can link an overlapping PERIOD Goal or a " + level
                                + " CALENDAR Goal of the reviewed period.",
                        field + ".goalId");
            }
        }

        UUID targetGoalId = request.targetGoalId();
        if (targetGoalId != null && request.kind() != ReviewItemKind.TRY) {
            throw new ApiException(ErrorCode.INVALID_REVIEW_GOAL,
                    "Only Try items can be carried into a next Goal.", field + ".targetGoalId");
        }
        if (targetGoalId != null && !targetGoalId.equals(item.getTargetGoalId())) {
            Goal target = goals.findByIdAndUserId(targetGoalId, currentUser.id()).orElse(null);
            if (target == null || !target.isCalendar() || target.getType() != level
                    || !target.getEndDate().isAfter(review.getPeriodEnd())) {
                throw new ApiException(ErrorCode.INVALID_REVIEW_GOAL,
                        "A Try can be carried into a " + level + " Goal that continues after the reviewed period.",
                        field + ".targetGoalId");
            }
        }
    }
}
