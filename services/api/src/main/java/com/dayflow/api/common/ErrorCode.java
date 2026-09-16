package com.dayflow.api.common;

import org.springframework.http.HttpStatus;

/**
 * API error codes. Domain rule codes use the same names as DomainIssueCode in
 * packages/domain so web and mobile clients can share handling.
 */
public enum ErrorCode {
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "Invalid request"),
    INVALID_GOAL_PERIOD(HttpStatus.BAD_REQUEST, "Invalid Goal period"),
    INVALID_GOAL_PARENT(HttpStatus.BAD_REQUEST, "Invalid Goal parent"),
    GOAL_OUTSIDE_PARENT_PERIOD(HttpStatus.BAD_REQUEST, "Goal outside parent period"),
    DAY_REQUIRES_WEEK_GOAL(HttpStatus.BAD_REQUEST, "Day requires a WEEK Goal"),
    DATE_OUTSIDE_WEEK_GOAL_PERIOD(HttpStatus.BAD_REQUEST, "Date outside WEEK Goal period"),
    INVALID_SCHEDULE_RANGE(HttpStatus.BAD_REQUEST, "Invalid schedule range"),
    INVALID_REVIEW_PERIOD(HttpStatus.BAD_REQUEST, "Invalid review period"),
    REVIEW_ITEM_NOT_TRY(HttpStatus.BAD_REQUEST, "Only Try items can become a Day"),
    INVALID_REVIEW_GOAL(HttpStatus.BAD_REQUEST, "Invalid review item Goal"),
    INVALID_RECOVERY_DECISION(HttpStatus.BAD_REQUEST, "Invalid recovery decision"),
    INVALID_RECOVERY_RETURN_DATE(HttpStatus.BAD_REQUEST, "Invalid recovery return date"),
    INVALID_EVENT_TIME(HttpStatus.BAD_REQUEST, "Invalid Event time"),
    INVALID_EVENT_REMINDERS(HttpStatus.BAD_REQUEST, "Invalid Event reminders"),
    INVALID_EVENT_GOAL(HttpStatus.BAD_REQUEST, "Linked Goal not found"),
    INVALID_OCCURRENCE_RANGE(HttpStatus.BAD_REQUEST, "Invalid occurrence range"),
    INVALID_DAY_TAG_COLOR(HttpStatus.BAD_REQUEST, "Invalid Day Tag color"),
    DUPLICATE_DAY_TAG_NAME(HttpStatus.BAD_REQUEST, "Duplicate Day Tag name"),
    TOO_MANY_DAY_TAGS(HttpStatus.BAD_REQUEST, "Too many Day Tags"),
    INVALID_DAY_TAG(HttpStatus.BAD_REQUEST, "Day Tag not found"),

    GOAL_NOT_FOUND(HttpStatus.NOT_FOUND, "Goal not found"),
    DAY_NOT_FOUND(HttpStatus.NOT_FOUND, "Day not found"),
    SCHEDULE_NOT_FOUND(HttpStatus.NOT_FOUND, "Schedule not found"),
    REVIEW_NOT_FOUND(HttpStatus.NOT_FOUND, "Review not found"),
    REVIEW_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "Review item not found"),
    RECOVERY_DAY_NOT_FOUND(HttpStatus.NOT_FOUND, "Recovery day not found"),
    EVENT_NOT_FOUND(HttpStatus.NOT_FOUND, "Event not found"),
    DAY_TAG_NOT_FOUND(HttpStatus.NOT_FOUND, "Day Tag not found"),

    VERSION_CONFLICT(HttpStatus.CONFLICT, "Version conflict"),
    SCHEDULE_VERSION_CONFLICT(HttpStatus.CONFLICT, "Schedule version conflict"),
    GOAL_IN_USE(HttpStatus.CONFLICT, "Goal in use"),
    DATA_CONFLICT(HttpStatus.CONFLICT, "Data conflict");

    private final HttpStatus status;
    private final String title;

    ErrorCode(HttpStatus status, String title) {
        this.status = status;
        this.title = title;
    }

    public HttpStatus status() {
        return status;
    }

    public String title() {
        return title;
    }
}
