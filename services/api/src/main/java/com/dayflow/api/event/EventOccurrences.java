package com.dayflow.api.event;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Expands an Event into the occurrences that touch a date range (EVT-003, requirements §8.4).
 * The range is read as local dates in each Event's own timezone, the same wall-clock model the
 * Calendar uses for Day schedules. Occurrences are computed, never stored.
 */
public final class EventOccurrences {

    /** Upper bound of loop iterations for one Event; a 366-day range needs far fewer. */
    private static final int MAX_ITERATIONS = 2_000;

    public record Occurrence(Instant startAt, Instant endAt, LocalDate startDate, LocalDate endDateExclusive) {
    }

    private EventOccurrences() {
    }

    /** Occurrences overlapping from..to (inclusive dates), in start order. */
    public static List<Occurrence> between(Event event, LocalDate from, LocalDate to) {
        return event.isAllDay() ? allDay(event, from, to) : timed(event, from, to);
    }

    private static List<Occurrence> allDay(Event event, LocalDate from, LocalDate to) {
        EventRecurrence recurrence = event.getRecurrence();
        LocalDate anchor = event.getStartDate();
        long lengthDays = ChronoUnit.DAYS.between(anchor, event.getEndDateExclusive());
        List<Occurrence> result = new ArrayList<>();
        long n = recurrence.firstIndexNotAfter(anchor, from.minusDays(lengthDays));
        for (int i = 0; i < MAX_ITERATIONS; i++, n++) {
            LocalDate start = recurrence.nth(anchor, n);
            if (start.isAfter(to)) {
                break;
            }
            LocalDate endExclusive = start.plusDays(lengthDays);
            if (endExclusive.isAfter(from)) {
                result.add(new Occurrence(null, null, start, endExclusive));
            }
            if (recurrence == EventRecurrence.NONE) {
                break;
            }
        }
        return result;
    }

    private static List<Occurrence> timed(Event event, LocalDate from, LocalDate to) {
        EventRecurrence recurrence = event.getRecurrence();
        ZoneId zone = event.zoneId();
        ZonedDateTime anchor = event.getStartAt().atZone(zone);
        LocalDate anchorDate = anchor.toLocalDate();
        LocalTime anchorTime = anchor.toLocalTime();
        Duration duration = Duration.between(event.getStartAt(), event.getEndAt());
        LocalDateTime windowStart = from.atStartOfDay();
        LocalDateTime windowEnd = to.plusDays(1).atStartOfDay();

        List<Occurrence> result = new ArrayList<>();
        long n = recurrence.firstIndexNotAfter(anchorDate, from.minusDays(duration.toDays() + 1));
        for (int i = 0; i < MAX_ITERATIONS; i++, n++) {
            // Always the anchor's local time on the n-th date; a DST gap shifts it forward.
            ZonedDateTime start = ZonedDateTime.of(recurrence.nth(anchorDate, n), anchorTime, zone);
            LocalDateTime startLocal = start.toLocalDateTime();
            if (!startLocal.isBefore(windowEnd)) {
                break;
            }
            ZonedDateTime end = start.plus(duration);
            // A zero-length occurrence (e.g. a 23:59 deadline) counts when its instant is inside the range.
            if (end.toLocalDateTime().isAfter(windowStart) || !startLocal.isBefore(windowStart)) {
                result.add(new Occurrence(start.toInstant(), end.toInstant(), null, null));
            }
            if (recurrence == EventRecurrence.NONE) {
                break;
            }
        }
        return result;
    }
}
