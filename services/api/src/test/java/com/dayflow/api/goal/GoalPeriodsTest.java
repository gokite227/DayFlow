package com.dayflow.api.goal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** GOAL-004 calendar periods without Spring or a database. */
class GoalPeriodsTest {

    @Test
    void goal004YearQuarterAndMonthBoundaries() {
        assertThat(GoalPeriods.isCanonical(GoalType.YEAR, d("2026-01-01"), d("2026-12-31"))).isTrue();
        assertThat(GoalPeriods.isCanonical(GoalType.QUARTER, d("2026-04-01"), d("2026-06-30"))).isTrue();
        assertThat(GoalPeriods.isCanonical(GoalType.QUARTER, d("2026-01-01"), d("2026-12-31"))).isFalse();
        assertThat(GoalPeriods.isCanonical(GoalType.MONTH, d("2028-02-01"), d("2028-02-29"))).isTrue();
        assertThat(GoalPeriods.isCanonical(GoalType.MONTH, d("2026-02-01"), d("2026-02-28"))).isTrue();
        assertThat(GoalPeriods.isCanonical(GoalType.MONTH, d("2028-02-01"), d("2028-02-28"))).isFalse();
    }

    @Test
    void goal004WeekSegmentsAreCutAtTheMonthBoundary() {
        assertThat(GoalPeriods.containing(GoalType.WEEK, d("2026-09-03"))).containsExactly(d("2026-09-01"), d("2026-09-06"));
        assertThat(GoalPeriods.containing(GoalType.WEEK, d("2026-09-16"))).containsExactly(d("2026-09-14"), d("2026-09-20"));
        assertThat(GoalPeriods.containing(GoalType.WEEK, d("2026-09-30"))).containsExactly(d("2026-09-28"), d("2026-09-30"));
        assertThat(GoalPeriods.isCanonical(GoalType.WEEK, d("2026-09-28"), d("2026-10-04"))).isFalse();
        assertThat(GoalPeriods.isCanonical(GoalType.WEEK, d("2026-06-01"), d("2026-06-07"))).isTrue();
    }

    private static LocalDate d(String value) {
        return LocalDate.parse(value);
    }
}
