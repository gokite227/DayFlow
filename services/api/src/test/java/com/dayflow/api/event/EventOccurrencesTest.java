package com.dayflow.api.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** EVT-003 recurrence expansion without Spring or a database. */
class EventOccurrencesTest {

    @Test
    void evt003MonthlyOn31stClampsToMonthEndWithoutDrifting() {
        Event event = allDay(EventRecurrence.MONTHLY, "2027-01-31", "2027-02-01");

        List<LocalDate> starts = startDates(EventOccurrences.between(event,
                LocalDate.parse("2027-01-01"), LocalDate.parse("2027-05-31")));

        assertThat(starts).containsExactly(LocalDate.parse("2027-01-31"), LocalDate.parse("2027-02-28"),
                LocalDate.parse("2027-03-31"), LocalDate.parse("2027-04-30"), LocalDate.parse("2027-05-31"));
    }

    @Test
    void evt003YearlyOnLeapDayUsesFeb28InCommonYears() {
        Event event = allDay(EventRecurrence.YEARLY, "2028-02-29", "2028-03-01");

        assertThat(startDates(EventOccurrences.between(event, LocalDate.parse("2029-01-01"),
                LocalDate.parse("2029-12-31")))).containsExactly(LocalDate.parse("2029-02-28"));
        assertThat(startDates(EventOccurrences.between(event, LocalDate.parse("2032-01-01"),
                LocalDate.parse("2032-12-31")))).containsExactly(LocalDate.parse("2032-02-29"));
    }

    @Test
    void evt003TimedMonthlyKeepsLocalTimeAndDuration() {
        Event event = new Event("Report", EventType.DEADLINE, "Asia/Seoul", EventRecurrence.MONTHLY);
        event.placeTimed(Instant.parse("2027-01-31T05:00:00Z"), Instant.parse("2027-01-31T06:30:00Z"));

        List<EventOccurrences.Occurrence> found = EventOccurrences.between(event,
                LocalDate.parse("2027-02-01"), LocalDate.parse("2027-03-31"));

        assertThat(found).extracting(EventOccurrences.Occurrence::startAt)
                .containsExactly(Instant.parse("2027-02-28T05:00:00Z"), Instant.parse("2027-03-31T05:00:00Z"));
        assertThat(found).extracting(EventOccurrences.Occurrence::endAt)
                .containsExactly(Instant.parse("2027-02-28T06:30:00Z"), Instant.parse("2027-03-31T06:30:00Z"));
    }

    @Test
    void evt003RangeUsesTheEventTimezoneAndIncludesZeroLengthDeadlines() {
        // 2026-09-30 23:59 in Seoul is 14:59 UTC the same day.
        Event event = new Event("Portfolio", EventType.DEADLINE, "Asia/Seoul", EventRecurrence.NONE);
        event.placeTimed(Instant.parse("2026-09-30T14:59:00Z"), Instant.parse("2026-09-30T14:59:00Z"));

        assertThat(EventOccurrences.between(event, LocalDate.parse("2026-09-30"), LocalDate.parse("2026-09-30")))
                .hasSize(1);
        assertThat(EventOccurrences.between(event, LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-07")))
                .isEmpty();
    }

    @Test
    void evt003MultiDayAllDayOccurrenceOverlapsTheRangeStart() {
        Event event = allDay(EventRecurrence.NONE, "2026-09-12", "2026-09-15");

        assertThat(EventOccurrences.between(event, LocalDate.parse("2026-09-14"), LocalDate.parse("2026-09-20")))
                .hasSize(1);
        assertThat(EventOccurrences.between(event, LocalDate.parse("2026-09-15"), LocalDate.parse("2026-09-20")))
                .isEmpty();
    }

    @Test
    void evt003DailyEventStartsAtTheFirstDateInsideALateRange() {
        Event event = allDay(EventRecurrence.DAILY, "2020-01-01", "2020-01-02");

        List<LocalDate> starts = startDates(EventOccurrences.between(event,
                LocalDate.parse("2026-09-14"), LocalDate.parse("2026-09-20")));

        assertThat(starts).hasSize(7).first().isEqualTo(LocalDate.parse("2026-09-14"));
    }

    private static Event allDay(EventRecurrence recurrence, String start, String endExclusive) {
        Event event = new Event("Birthday", EventType.BIRTHDAY, "Asia/Seoul", recurrence);
        event.placeAllDay(LocalDate.parse(start), LocalDate.parse(endExclusive));
        return event;
    }

    private static List<LocalDate> startDates(List<EventOccurrences.Occurrence> occurrences) {
        return occurrences.stream().map(EventOccurrences.Occurrence::startDate).toList();
    }
}
