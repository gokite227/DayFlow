package com.dayflow.api.event;

import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ApiException.FieldViolation;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.event.EventDtos.CreateEventRequest;
import com.dayflow.api.event.EventDtos.EventOccurrenceResponse;
import com.dayflow.api.event.EventDtos.EventResponse;
import com.dayflow.api.event.EventDtos.UpdateEventRequest;
import com.dayflow.api.goal.GoalRepository;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Server-side Event rules (EVT-001..004, NOTI-001) and occurrence expansion (EVT-003, CAL-003). */
@Service
@Transactional
public class EventService {

    /**
     * Longest /event-occurrences range, inclusive. A full (leap) year lets the Events screen show the
     * next occurrence of every yearly Event, while a DAILY Event still expands to at most 366 rows.
     */
    public static final int MAX_OCCURRENCE_RANGE_DAYS = 366;

    private final EventRepository events;
    private final GoalRepository goals;
    private final EventCategoryService categories;
    private final CurrentUser currentUser;

    public EventService(EventRepository events, GoalRepository goals, EventCategoryService categories,
            CurrentUser currentUser) {
        this.events = events;
        this.goals = goals;
        this.categories = categories;
        this.currentUser = currentUser;
    }

    public EventResponse create(CreateEventRequest request) {
        validateZone(request.timezone());
        validateReminders(request.reminders());
        validateGoal(request.linkedGoalId());

        Event event = new Event(currentUser.id(), request.title().strip(), categories.resolve(request.categoryId()),
                request.timezone(), request.recurrence());
        place(event, request.allDay(), request.startAt(), request.endAt(), request.startDate(),
                request.endDateExclusive(), null);
        event.setLocation(blankToNull(request.location()));
        event.setNotes(blankToNull(request.notes()));
        event.setLinkedGoalId(request.linkedGoalId());
        event.replaceReminders(request.reminders());
        return EventResponse.from(events.saveAndFlush(event));
    }

    /** categoryId: one Category; hasCategory=false: uncategorized only (EVT-002, EVT-006). */
    @Transactional(readOnly = true)
    public List<EventResponse> list(UUID categoryId, Boolean hasCategory, UUID linkedGoalId) {
        UUID userId = currentUser.id();
        Specification<Event> filter = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("userId"), userId));
            predicates.add(categoryFilter(root, cb, categoryId, hasCategory));
            if (linkedGoalId != null) {
                predicates.add(cb.equal(root.get("linkedGoalId"), linkedGoalId));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        return events.findAll(filter).stream()
                .sorted(Comparator.comparing(EventService::anchorLocal).thenComparing(Event::getTitle))
                .map(EventResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public EventResponse get(UUID id) {
        return EventResponse.from(find(id));
    }

    public EventResponse update(UUID id, UpdateEventRequest request) {
        Event event = find(id);
        requireVersion(event, request.getVersion());
        if (!request.hasAnyChange()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "At least one Event field must be provided.");
        }

        String timezone = request.getTimezone() != null ? request.getTimezone().strip() : event.getTimezone();
        validateZone(timezone);
        boolean allDay = request.getAllDay() != null ? request.getAllDay() : event.isAllDay();
        // Values of the other kind stored on the entity are dropped; values of the other kind sent in
        // the request are rejected by place().
        place(event, allDay,
                request.getStartAt(), request.getEndAt(), request.getStartDate(), request.getEndDateExclusive(),
                event);
        if (request.getReminders() != null) {
            validateReminders(request.getReminders());
            event.replaceReminders(request.getReminders());
        }
        if (request.hasLinkedGoalId()) {
            validateGoal(request.getLinkedGoalId());
            event.setLinkedGoalId(request.getLinkedGoalId());
        }
        if (request.getTitle() != null) {
            event.setTitle(request.getTitle().strip());
        }
        if (request.hasCategoryId()) {
            event.setCategory(categories.resolve(request.getCategoryId()));
        }
        if (request.getRecurrence() != null) {
            event.setRecurrence(request.getRecurrence());
        }
        if (request.hasLocation()) {
            event.setLocation(blankToNull(request.getLocation()));
        }
        if (request.hasNotes()) {
            event.setNotes(blankToNull(request.getNotes()));
        }
        event.setTimezone(timezone);
        return EventResponse.from(events.saveAndFlush(event));
    }

    /** Reminders are removed with the Event by the database cascade. */
    public void delete(UUID id, long version) {
        Event event = find(id);
        requireVersion(event, version);
        events.delete(event);
        events.flush();
    }

    /** Occurrences of all Events (optionally one Category, or only uncategorized) touching from..to, in local start order. */
    @Transactional(readOnly = true)
    public List<EventOccurrenceResponse> occurrences(LocalDate from, LocalDate to, UUID categoryId,
            Boolean hasCategory) {
        if (from.isAfter(to)) {
            throw new ApiException(ErrorCode.INVALID_OCCURRENCE_RANGE, "from must be on or before to.", "from");
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_OCCURRENCE_RANGE_DAYS) {
            throw new ApiException(ErrorCode.INVALID_OCCURRENCE_RANGE,
                    "The range can cover at most " + MAX_OCCURRENCE_RANGE_DAYS + " days.", "to");
        }

        record Found(Event event, EventOccurrences.Occurrence occurrence) {
        }
        return events.findAll(candidates(currentUser.id(), from, to, categoryId, hasCategory)).stream()
                .flatMap(event -> EventOccurrences.between(event, from, to).stream()
                        .map(occurrence -> new Found(event, occurrence)))
                .sorted(Comparator.comparing((Found found) -> localStart(found.event(), found.occurrence()))
                        .thenComparing(found -> !found.event().isAllDay())
                        .thenComparing(found -> found.event().getTitle()))
                .map(found -> EventOccurrenceResponse.from(found.event(), found.occurrence()))
                .toList();
    }

    /**
     * Coarse database filter. Non-recurring Events must overlap the range (padded by a day for
     * timezone offsets); recurring Events must start before the range ends. Exact overlap is
     * decided by {@link EventOccurrences}.
     */
    private static Specification<Event> candidates(UUID userId, LocalDate from, LocalDate to, UUID categoryId,
            Boolean hasCategory) {
        Instant paddedStart = from.minusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant paddedEnd = to.plusDays(2).atStartOfDay().toInstant(ZoneOffset.UTC);
        return (root, query, cb) -> {
            Predicate timed = cb.isFalse(root.<Boolean>get("allDay"));
            Predicate allDay = cb.isTrue(root.<Boolean>get("allDay"));
            Predicate once = cb.equal(root.get("recurrence"), EventRecurrence.NONE);
            Predicate timedOverlap = cb.and(timed, cb.lessThan(root.<Instant>get("startAt"), paddedEnd),
                    cb.greaterThanOrEqualTo(root.<Instant>get("endAt"), paddedStart));
            Predicate allDayOverlap = cb.and(allDay, cb.lessThanOrEqualTo(root.<LocalDate>get("startDate"), to),
                    cb.greaterThan(root.<LocalDate>get("endDateExclusive"), from));
            Predicate startsBeforeEnd = cb.or(cb.and(timed, cb.lessThan(root.<Instant>get("startAt"), paddedEnd)),
                    cb.and(allDay, cb.lessThanOrEqualTo(root.<LocalDate>get("startDate"), to)));
            Predicate match = cb.or(cb.and(once, cb.or(timedOverlap, allDayOverlap)),
                    cb.and(cb.not(once), startsBeforeEnd));
            return cb.and(cb.equal(root.get("userId"), userId), match, categoryFilter(root, cb, categoryId, hasCategory));
        };
    }

    /** No filter when both are null; categoryId wins over hasCategory. */
    private static Predicate categoryFilter(Root<Event> root, CriteriaBuilder cb, UUID categoryId, Boolean hasCategory) {
        if (categoryId != null) {
            return cb.equal(root.get("category").get("id"), categoryId);
        }
        if (hasCategory != null) {
            return hasCategory ? cb.isNotNull(root.get("category")) : cb.isNull(root.get("category"));
        }
        return cb.conjunction();
    }

    private Event find(UUID id) {
        return events.findByIdAndUserId(id, currentUser.id())
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_NOT_FOUND, "Event " + id + " was not found."));
    }

    private static void requireVersion(Event event, Long version) {
        if (!Objects.equals(event.getVersion(), version)) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT,
                    "The Event was changed by another request. Reload and try again.", "version");
        }
    }

    /**
     * Validates the timed/all-day shape (requirements §8.4) and stores it. With {@code current}, a
     * missing field of the resulting kind falls back to the stored value of that kind.
     */
    private static void place(Event event, boolean allDay, OffsetDateTime startAt, OffsetDateTime endAt,
            LocalDate startDate, LocalDate endDateExclusive, Event current) {
        List<FieldViolation> violations = new ArrayList<>();
        if (allDay) {
            rejectPresent(violations, "startAt", startAt, "must be null for an all-day Event");
            rejectPresent(violations, "endAt", endAt, "must be null for an all-day Event");
            LocalDate start = startDate != null ? startDate : currentAllDay(current, true);
            LocalDate end = endDateExclusive != null ? endDateExclusive : currentAllDay(current, false);
            requirePresent(violations, "startDate", start, "is required for an all-day Event");
            requirePresent(violations, "endDateExclusive", end, "is required for an all-day Event");
            if (start != null && end != null && !end.isAfter(start)) {
                violations.add(new FieldViolation("endDateExclusive", "must be after startDate"));
            }
            throwIfAny(violations);
            event.placeAllDay(start, end);
        } else {
            rejectPresent(violations, "startDate", startDate, "must be null for a timed Event");
            rejectPresent(violations, "endDateExclusive", endDateExclusive, "must be null for a timed Event");
            Instant start = startAt != null ? startAt.toInstant() : currentTimed(current, true);
            Instant end = endAt != null ? endAt.toInstant() : currentTimed(current, false);
            requirePresent(violations, "startAt", start, "is required for a timed Event");
            requirePresent(violations, "endAt", end, "is required for a timed Event");
            if (start != null && end != null && end.isBefore(start)) {
                violations.add(new FieldViolation("endAt", "must not be before startAt"));
            }
            throwIfAny(violations);
            event.placeTimed(start, end);
        }
    }

    private static LocalDate currentAllDay(Event current, boolean start) {
        if (current == null || !current.isAllDay()) {
            return null;
        }
        return start ? current.getStartDate() : current.getEndDateExclusive();
    }

    private static Instant currentTimed(Event current, boolean start) {
        if (current == null || current.isAllDay()) {
            return null;
        }
        return start ? current.getStartAt() : current.getEndAt();
    }

    private static void rejectPresent(List<FieldViolation> violations, String field, Object value, String message) {
        if (value != null) {
            violations.add(new FieldViolation(field, message));
        }
    }

    private static void requirePresent(List<FieldViolation> violations, String field, Object value, String message) {
        if (value == null) {
            violations.add(new FieldViolation(field, message));
        }
    }

    private static void throwIfAny(List<FieldViolation> violations) {
        if (!violations.isEmpty()) {
            throw new ApiException(ErrorCode.INVALID_EVENT_TIME,
                    "Timed Events need startAt/endAt and all-day Events need startDate/endDateExclusive.",
                    violations);
        }
    }

    private static void validateReminders(List<Integer> offsets) {
        if (offsets.size() > EventDtos.MAX_REMINDERS) {
            throw new ApiException(ErrorCode.INVALID_EVENT_REMINDERS,
                    "An Event can have at most " + EventDtos.MAX_REMINDERS + " reminders.", "reminders");
        }
        if (new HashSet<>(offsets).size() != offsets.size()) {
            throw new ApiException(ErrorCode.INVALID_EVENT_REMINDERS, "Reminder offsets must not repeat.",
                    "reminders");
        }
    }

    /** A linked Goal must be one of the current user's Goals; another user's Goal is reported as not found. */
    private void validateGoal(UUID goalId) {
        if (goalId != null && !goals.existsByIdAndUserId(goalId, currentUser.id())) {
            throw new ApiException(ErrorCode.INVALID_EVENT_GOAL, "Goal " + goalId + " was not found.",
                    "linkedGoalId");
        }
    }

    /** Only region-based IANA ids (e.g. Asia/Seoul) are accepted, not raw offsets. */
    private static void validateZone(String timezone) {
        if (timezone == null || !ZoneId.getAvailableZoneIds().contains(timezone)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "timezone must be a valid IANA timezone.",
                    "timezone");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static LocalDateTime anchorLocal(Event event) {
        return event.isAllDay()
                ? event.getStartDate().atStartOfDay()
                : event.getStartAt().atZone(event.zoneId()).toLocalDateTime();
    }

    private static LocalDateTime localStart(Event event, EventOccurrences.Occurrence occurrence) {
        return event.isAllDay()
                ? occurrence.startDate().atStartOfDay()
                : occurrence.startAt().atZone(event.zoneId()).toLocalDateTime();
    }
}
