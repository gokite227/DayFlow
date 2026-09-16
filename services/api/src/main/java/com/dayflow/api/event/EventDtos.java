package com.dayflow.api.event;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.event.EventCategoryDtos.EventCategorySummary;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Request/response bodies of /api/v1/events and /api/v1/event-occurrences (requirements §8.4, §9.2).
 * Timed Events use startAt/endAt, all-day Events use startDate/endDateExclusive; the other pair is null.
 */
public final class EventDtos {

    public static final int MAX_REMINDERS = 5;
    public static final int MAX_REMINDER_OFFSET_MINUTES = 43_200;

    private EventDtos() {
    }

    public record CreateEventRequest(
            @NotBlank @Size(max = 200) String title,
            @Schema(types = {"string", "null"}, format = "uuid",
                    description = "Event Category (EVT-006); null or omitted for an uncategorized Event")
            UUID categoryId,
            @NotNull Boolean allDay,
            @Schema(types = {"string", "null"}, format = "date-time", description = "Timed Events only")
            OffsetDateTime startAt,
            @Schema(types = {"string", "null"}, format = "date-time", description = "Timed Events only; >= startAt")
            OffsetDateTime endAt,
            @Schema(types = {"string", "null"}, format = "date", description = "All-day Events only")
            LocalDate startDate,
            @Schema(types = {"string", "null"}, format = "date",
                    description = "All-day Events only; the day after the last day")
            LocalDate endDateExclusive,
            @NotBlank @Size(max = 64) String timezone,
            @Schema(types = {"string", "null"}) @Size(max = 200) String location,
            @Schema(types = {"string", "null"}) @Size(max = 2000) String notes,
            @NotNull EventRecurrence recurrence,
            @NotNull @Size(max = MAX_REMINDERS)
            @ArraySchema(maxItems = MAX_REMINDERS, schema = @Schema(minimum = "0", maximum = "43200"),
                    arraySchema = @Schema(description = "Minutes before each occurrence start; at most 5, no duplicates"))
            List<@NotNull @PositiveOrZero @Max(MAX_REMINDER_OFFSET_MINUTES) Integer> reminders,
            @Schema(types = {"string", "null"}, format = "uuid") UUID linkedGoalId) {
    }

    /**
     * PATCH body. Omitted fields stay unchanged. Time fields: send the pair of the resulting kind
     * (switching allDay requires both new fields). {@code location}, {@code notes} and
     * {@code linkedGoalId} can be cleared with an explicit null, so their presence is tracked.
     * {@code reminders} replaces the whole list.
     */
    public static class UpdateEventRequest {

        @Size(max = 200)
        @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
        private String title;

        @Schema(types = {"string", "null"}, format = "uuid", description = "Omit to keep; null makes the Event uncategorized")
        private UUID categoryId;
        private boolean categoryIdProvided;

        private Boolean allDay;

        @Schema(types = {"string", "null"}, format = "date-time", description = "Timed only; null is the same as omitted")
        private OffsetDateTime startAt;

        @Schema(types = {"string", "null"}, format = "date-time", description = "Timed only; null is the same as omitted")
        private OffsetDateTime endAt;

        @Schema(types = {"string", "null"}, format = "date", description = "All-day only; null is the same as omitted")
        private LocalDate startDate;

        @Schema(types = {"string", "null"}, format = "date", description = "All-day only; null is the same as omitted")
        private LocalDate endDateExclusive;

        @Size(max = 64)
        @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
        private String timezone;

        @Schema(types = {"string", "null"}, description = "Omit to keep; null clears it")
        @Size(max = 200)
        private String location;
        private boolean locationProvided;

        @Schema(types = {"string", "null"}, description = "Omit to keep; null clears it")
        @Size(max = 2000)
        private String notes;
        private boolean notesProvided;

        private EventRecurrence recurrence;

        @Size(max = MAX_REMINDERS)
        @ArraySchema(maxItems = MAX_REMINDERS, schema = @Schema(minimum = "0", maximum = "43200"),
                arraySchema = @Schema(description = "Omit to keep; a list replaces all reminders"))
        private List<@NotNull @PositiveOrZero @Max(MAX_REMINDER_OFFSET_MINUTES) Integer> reminders;

        @Schema(types = {"string", "null"}, format = "uuid", description = "Omit to keep; null unlinks the Goal")
        private UUID linkedGoalId;
        private boolean linkedGoalIdProvided;

        @NotNull
        @PositiveOrZero
        private Long version;

        public boolean hasAnyChange() {
            return title != null || categoryIdProvided || allDay != null || startAt != null || endAt != null
                    || startDate != null || endDateExclusive != null || timezone != null || locationProvided
                    || notesProvided || recurrence != null || reminders != null || linkedGoalIdProvided;
        }

        public boolean hasCategoryId() {
            return categoryIdProvided;
        }

        public boolean hasLocation() {
            return locationProvided;
        }

        public boolean hasNotes() {
            return notesProvided;
        }

        public boolean hasLinkedGoalId() {
            return linkedGoalIdProvided;
        }

        public String getTitle() {
            return title;
        }

        public void setTitle(String title) {
            this.title = title;
        }

        public UUID getCategoryId() {
            return categoryId;
        }

        public void setCategoryId(UUID categoryId) {
            this.categoryId = categoryId;
            this.categoryIdProvided = true;
        }

        public Boolean getAllDay() {
            return allDay;
        }

        public void setAllDay(Boolean allDay) {
            this.allDay = allDay;
        }

        public OffsetDateTime getStartAt() {
            return startAt;
        }

        public void setStartAt(OffsetDateTime startAt) {
            this.startAt = startAt;
        }

        public OffsetDateTime getEndAt() {
            return endAt;
        }

        public void setEndAt(OffsetDateTime endAt) {
            this.endAt = endAt;
        }

        public LocalDate getStartDate() {
            return startDate;
        }

        public void setStartDate(LocalDate startDate) {
            this.startDate = startDate;
        }

        public LocalDate getEndDateExclusive() {
            return endDateExclusive;
        }

        public void setEndDateExclusive(LocalDate endDateExclusive) {
            this.endDateExclusive = endDateExclusive;
        }

        public String getTimezone() {
            return timezone;
        }

        public void setTimezone(String timezone) {
            this.timezone = timezone;
        }

        public String getLocation() {
            return location;
        }

        public void setLocation(String location) {
            this.location = location;
            this.locationProvided = true;
        }

        public String getNotes() {
            return notes;
        }

        public void setNotes(String notes) {
            this.notes = notes;
            this.notesProvided = true;
        }

        public EventRecurrence getRecurrence() {
            return recurrence;
        }

        public void setRecurrence(EventRecurrence recurrence) {
            this.recurrence = recurrence;
        }

        public List<Integer> getReminders() {
            return reminders;
        }

        public void setReminders(List<Integer> reminders) {
            this.reminders = reminders;
        }

        public UUID getLinkedGoalId() {
            return linkedGoalId;
        }

        public void setLinkedGoalId(UUID linkedGoalId) {
            this.linkedGoalId = linkedGoalId;
            this.linkedGoalIdProvided = true;
        }

        public Long getVersion() {
            return version;
        }

        public void setVersion(Long version) {
            this.version = version;
        }
    }

    /** Every field is always serialized; the time pair of the other kind is null. */
    public record EventResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String title,
            @Schema(requiredMode = REQUIRED, types = {"object", "null"}, description = "null for an uncategorized Event (미분류)")
            EventCategorySummary category,
            @Schema(requiredMode = REQUIRED) boolean allDay,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date-time",
                    description = "Timed Events: start with the Event timezone offset; null for all-day")
            OffsetDateTime startAt,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date-time",
                    description = "Timed Events: end with the Event timezone offset; null for all-day")
            OffsetDateTime endAt,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date",
                    description = "All-day Events: first date; null for timed")
            LocalDate startDate,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date",
                    description = "All-day Events: the day after the last date; null for timed")
            LocalDate endDateExclusive,
            @Schema(requiredMode = REQUIRED) String timezone,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}) String location,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}) String notes,
            @Schema(requiredMode = REQUIRED) EventRecurrence recurrence,
            @ArraySchema(schema = @Schema(format = "int32"), arraySchema = @Schema(requiredMode = REQUIRED,
                    description = "Reminder offsets in minutes, ascending"))
            List<Integer> reminders,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "uuid") UUID linkedGoalId,
            @Schema(requiredMode = REQUIRED) Instant createdAt,
            @Schema(requiredMode = REQUIRED) Instant updatedAt,
            @Schema(requiredMode = REQUIRED) long version) {

        static EventResponse from(Event event) {
            return new EventResponse(event.getId(), event.getTitle(), EventCategorySummary.from(event.getCategory()),
                    event.isAllDay(),
                    offset(event, event.getStartAt()), offset(event, event.getEndAt()), event.getStartDate(),
                    event.getEndDateExclusive(), event.getTimezone(), event.getLocation(), event.getNotes(),
                    event.getRecurrence(), event.reminderOffsets(), event.getLinkedGoalId(), event.getCreatedAt(),
                    event.getUpdatedAt(), event.getVersion());
        }
    }

    /** One computed occurrence of an Event inside the requested range (not stored). */
    public record EventOccurrenceResponse(
            @Schema(requiredMode = REQUIRED) UUID eventId,
            @Schema(requiredMode = REQUIRED) long eventVersion,
            @Schema(requiredMode = REQUIRED) String title,
            @Schema(requiredMode = REQUIRED, types = {"object", "null"}, description = "null for an uncategorized Event (미분류)")
            EventCategorySummary category,
            @Schema(requiredMode = REQUIRED) boolean allDay,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date-time",
                    description = "Timed occurrence start with the Event timezone offset; null for all-day")
            OffsetDateTime startAt,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date-time",
                    description = "Timed occurrence end with the Event timezone offset; null for all-day")
            OffsetDateTime endAt,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date",
                    description = "All-day occurrence first date; null for timed")
            LocalDate startDate,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "date",
                    description = "All-day occurrence end (exclusive); null for timed")
            LocalDate endDateExclusive,
            @Schema(requiredMode = REQUIRED) String timezone,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}) String location,
            @Schema(requiredMode = REQUIRED) EventRecurrence recurrence,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}, format = "uuid") UUID linkedGoalId) {

        static EventOccurrenceResponse from(Event event, EventOccurrences.Occurrence occurrence) {
            return new EventOccurrenceResponse(event.getId(), event.getVersion(), event.getTitle(),
                    EventCategorySummary.from(event.getCategory()),
                    event.isAllDay(), offset(event, occurrence.startAt()), offset(event, occurrence.endAt()),
                    occurrence.startDate(), occurrence.endDateExclusive(), event.getTimezone(), event.getLocation(),
                    event.getRecurrence(), event.getLinkedGoalId());
        }
    }

    private static OffsetDateTime offset(Event event, Instant instant) {
        return instant == null ? null : instant.atZone(event.zoneId()).toOffsetDateTime();
    }
}
