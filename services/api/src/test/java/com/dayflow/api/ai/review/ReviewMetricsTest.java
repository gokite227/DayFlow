package com.dayflow.api.ai.review;

import static org.assertj.core.api.Assertions.assertThat;

import com.dayflow.api.ai.review.ReviewMetrics.Counts;
import com.dayflow.api.ai.review.ReviewMetrics.DayInput;
import com.dayflow.api.ai.review.ReviewMetrics.TimeBucket;
import com.dayflow.api.day.DayPriority;
import com.dayflow.api.day.DayStatus;
import com.dayflow.api.review.ReviewType;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Deterministic Review numbers (no Spring, no model). */
class ReviewMetricsTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final LocalDate MONDAY = LocalDate.of(2026, 8, 3);

    private static DayInput day(LocalDate date, DayStatus status) {
        return new DayInput(UUID.randomUUID(), "Day", status, DayPriority.MEDIUM, false, null, date, false, null, null, null);
    }

    private static DayInput scheduled(LocalDate date, DayStatus status, String start, String end) {
        Instant from = date.atTime(java.time.LocalTime.parse(start)).atZone(SEOUL).toInstant();
        Instant to = date.atTime(java.time.LocalTime.parse(end)).atZone(SEOUL).toInstant();
        return new DayInput(UUID.randomUUID(), "Day", status, DayPriority.MEDIUM, false, null, date, false, from, to, SEOUL);
    }

    private static DayInput with(DayInput day, boolean core, DayPriority priority, boolean carriedIn) {
        return new DayInput(day.id(), day.title(), day.status(), priority, core, day.goalId(), day.plannedDate(), carriedIn,
                day.startAt(), day.endAt(), day.scheduleZone());
    }

    @Test
    void completionCountsLikeTheReviewScreen() {
        List<DayInput> days = List.of(
                with(day(MONDAY, DayStatus.DONE), true, DayPriority.HIGH, false),
                with(day(MONDAY, DayStatus.NOT_STARTED), true, DayPriority.HIGH, true),
                day(MONDAY.plusDays(1), DayStatus.DONE),
                day(MONDAY.plusDays(2), DayStatus.SKIPPED),
                day(MONDAY.plusDays(2), DayStatus.DEFERRED),
                // Outside the period: ignored.
                day(MONDAY.plusDays(9), DayStatus.DONE));

        ReviewMetrics.Result result = ReviewMetrics.analyze(ReviewType.WEEK, MONDAY, MONDAY.plusDays(6), days);

        assertThat(result.all()).isEqualTo(new Counts(5, 2, 1, 2));
        // done / (total - skipped)
        assertThat(result.all().completionRate()).isEqualTo(0.5);
        assertThat(result.core()).isEqualTo(new Counts(2, 1, 0, 1));
        assertThat(result.byPriority().get(DayPriority.HIGH)).isEqualTo(new Counts(2, 1, 0, 1));
        assertThat(result.byPriority().get(DayPriority.MEDIUM)).isEqualTo(new Counts(3, 1, 1, 1));
        assertThat(result.carriedIn()).isEqualTo(1);
        assertThat(new Counts(2, 0, 2, 0).completionRate()).isNull();
    }

    @Test
    void scheduleSummaryAndPerDateOverbooking() {
        List<DayInput> days = List.of(
                scheduled(MONDAY, DayStatus.DONE, "20:00", "21:00"),
                scheduled(MONDAY, DayStatus.NOT_STARTED, "20:00", "21:00"),
                scheduled(MONDAY, DayStatus.NOT_STARTED, "20:30", "21:30"),
                // Same clock time on another date is no conflict.
                scheduled(MONDAY.plusDays(1), DayStatus.DONE, "20:00", "21:00"),
                // Let go: not part of the plan any more.
                scheduled(MONDAY.plusDays(1), DayStatus.SKIPPED, "20:00", "21:00"),
                day(MONDAY, DayStatus.NOT_STARTED));

        ReviewMetrics.ScheduleSummary schedule =
                ReviewMetrics.analyze(ReviewType.WEEK, MONDAY, MONDAY.plusDays(6), days).schedule();

        assertThat(schedule.scheduled()).isEqualTo(5);
        assertThat(schedule.unscheduled()).isEqualTo(1);
        assertThat(schedule.totalMinutes()).isEqualTo(300);
        assertThat(schedule.completedMinutes()).isEqualTo(120);
        // Monday: 180 planned in 90 clock minutes.
        assertThat(schedule.overbookedMinutes()).isEqualTo(90);
        assertThat(schedule.overloadedDates()).isEqualTo(1);
        assertThat(schedule.peakConcurrent()).isEqualTo(3);
        assertThat(schedule.windows()).singleElement().satisfies(window -> {
            assertThat(window.date()).isEqualTo(MONDAY);
            assertThat(window.dayCount()).isEqualTo(3);
            assertThat(window.availableMinutes()).isEqualTo(90);
            assertThat(window.plannedMinutes()).isEqualTo(180);
        });
    }

    @Test
    void timeOfDayUsesThePlacementStartInItsOwnTimezone() {
        List<DayInput> days = List.of(
                scheduled(MONDAY, DayStatus.DONE, "05:00", "06:00"),
                scheduled(MONDAY, DayStatus.DONE, "11:59", "12:30"),
                scheduled(MONDAY, DayStatus.DONE, "12:00", "13:00"),
                scheduled(MONDAY, DayStatus.NOT_STARTED, "18:00", "19:00"),
                scheduled(MONDAY, DayStatus.NOT_STARTED, "22:00", "23:00"),
                scheduled(MONDAY, DayStatus.NOT_STARTED, "04:59", "05:30"),
                day(MONDAY, DayStatus.DONE));

        ReviewMetrics.Result result = ReviewMetrics.analyze(ReviewType.DAY, MONDAY, MONDAY, days);

        assertThat(result.timeOfDay().get(TimeBucket.MORNING)).isEqualTo(new Counts(2, 2, 0, 0));
        assertThat(result.timeOfDay().get(TimeBucket.AFTERNOON)).isEqualTo(new Counts(1, 1, 0, 0));
        assertThat(result.timeOfDay().get(TimeBucket.EVENING)).isEqualTo(new Counts(1, 0, 0, 1));
        assertThat(result.timeOfDay().get(TimeBucket.LATE_NIGHT)).isEqualTo(new Counts(2, 0, 0, 2));
        // The unscheduled Day belongs to no bucket.
        assertThat(result.timeOfDay().values().stream().mapToInt(Counts::total).sum()).isEqualTo(6);
    }

    @Test
    void smallSamplesAreNeverPatterns() {
        List<DayInput> one = List.of(scheduled(MONDAY, DayStatus.NOT_STARTED, "20:00", "21:00"));
        List<DayInput> two = List.of(scheduled(MONDAY, DayStatus.NOT_STARTED, "20:00", "21:00"),
                scheduled(MONDAY.plusDays(1), DayStatus.NOT_STARTED, "20:00", "21:00"));
        List<DayInput> three = new ArrayList<>(two);
        three.add(scheduled(MONDAY.plusDays(2), DayStatus.DONE, "20:00", "21:00"));
        // Skipped Days do not count toward the sample.
        List<DayInput> twoPlusSkipped = new ArrayList<>(two);
        twoPlusSkipped.add(scheduled(MONDAY.plusDays(3), DayStatus.SKIPPED, "20:00", "21:00"));

        assertThat(evening(one).enoughForPattern()).isFalse();
        assertThat(evening(two).enoughForPattern()).isFalse();
        assertThat(evening(twoPlusSkipped).enoughForPattern()).isFalse();
        assertThat(evening(three).enoughForPattern()).isTrue();
        assertThat(ReviewMetrics.analyze(ReviewType.WEEK, MONDAY, MONDAY.plusDays(6), two).anyTimePattern()).isFalse();
        assertThat(ReviewMetrics.analyze(ReviewType.WEEK, MONDAY, MONDAY.plusDays(6), three).anyTimePattern()).isTrue();
        assertThat(ReviewMetrics.MIN_PATTERN_SAMPLE).isEqualTo(3);
    }

    private static Counts evening(List<DayInput> days) {
        return ReviewMetrics.analyze(ReviewType.WEEK, MONDAY, MONDAY.plusDays(6), days).timeOfDay().get(TimeBucket.EVENING);
    }

    @Test
    void weekdaysCountPlannedDates() {
        List<DayInput> days = List.of(day(MONDAY, DayStatus.DONE), day(MONDAY, DayStatus.NOT_STARTED),
                day(MONDAY.plusDays(7), DayStatus.DONE), day(MONDAY.plusDays(4), DayStatus.DONE));

        ReviewMetrics.Result result = ReviewMetrics.analyze(ReviewType.MONTH, LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 31), days);

        assertThat(result.weekdays().get(DayOfWeek.MONDAY)).isEqualTo(new Counts(3, 2, 0, 1));
        assertThat(result.weekdays().get(DayOfWeek.MONDAY).enoughForPattern()).isTrue();
        assertThat(result.weekdays().get(DayOfWeek.FRIDAY)).isEqualTo(new Counts(1, 1, 0, 0));
    }

    @Test
    void breakdownDependsOnThePeriodType() {
        assertThat(ReviewMetrics.analyze(ReviewType.DAY, MONDAY, MONDAY, List.of()).breakdown()).isEmpty();
        assertThat(ReviewMetrics.analyze(ReviewType.WEEK, MONDAY, MONDAY.plusDays(6), List.of()).breakdown())
                .extracting(ReviewMetrics.Slice::label).containsExactly("8/3", "8/4", "8/5", "8/6", "8/7", "8/8", "8/9");

        List<DayInput> august = List.of(day(LocalDate.of(2026, 8, 30), DayStatus.DONE), day(LocalDate.of(2026, 8, 2), DayStatus.DONE));
        ReviewMetrics.Result month = ReviewMetrics.analyze(ReviewType.MONTH, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31), august);
        assertThat(month.breakdown()).extracting(ReviewMetrics.Slice::label).containsExactly("1주차", "2주차", "3주차", "4주차", "5주차");
        assertThat(month.breakdown().getLast().start()).isEqualTo(LocalDate.of(2026, 8, 29));
        assertThat(month.breakdown().getLast().end()).isEqualTo(LocalDate.of(2026, 8, 31));
        assertThat(month.breakdown().getLast().counts().done()).isEqualTo(1);

        assertThat(ReviewMetrics.analyze(ReviewType.QUARTER, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 9, 30), august)
                .breakdown()).extracting(slice -> slice.label() + ":" + slice.counts().total())
                .containsExactly("7월:0", "8월:2", "9월:0");
        assertThat(ReviewMetrics.analyze(ReviewType.YEAR, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31), august)
                .breakdown()).hasSize(12);
    }

    @Test
    void previousPeriodsAreCanonical() {
        assertThat(ReviewMetrics.previousStart(ReviewType.DAY, MONDAY)).isEqualTo(MONDAY.minusDays(1));
        assertThat(ReviewMetrics.previousStart(ReviewType.WEEK, MONDAY)).isEqualTo(LocalDate.of(2026, 7, 27));
        assertThat(ReviewMetrics.previousStart(ReviewType.MONTH, LocalDate.of(2026, 3, 1))).isEqualTo(LocalDate.of(2026, 2, 1));
        assertThat(ReviewMetrics.previousStart(ReviewType.QUARTER, LocalDate.of(2026, 1, 1))).isEqualTo(LocalDate.of(2025, 10, 1));
        assertThat(ReviewMetrics.previousStart(ReviewType.YEAR, LocalDate.of(2026, 1, 1))).isEqualTo(LocalDate.of(2025, 1, 1));
        // Each previous start is itself a valid start of that type.
        for (ReviewType type : ReviewType.values()) {
            LocalDate start = type == ReviewType.YEAR ? LocalDate.of(2026, 1, 1)
                    : type == ReviewType.QUARTER ? LocalDate.of(2026, 4, 1) : LocalDate.of(2026, 3, 1);
            assertThat(type.periodEnd(ReviewMetrics.previousStart(type, start))).isNotNull();
        }
        assertThat(ReviewMetrics.daysInPeriod(LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 28))).isEqualTo(28);
    }
}
