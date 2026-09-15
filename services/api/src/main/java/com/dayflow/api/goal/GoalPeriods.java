package com.dayflow.api.goal;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;

/**
 * GOAL-004 calendar periods, the same rules as goal-period.ts in packages/domain. A Goal's
 * startDate/endDate must be exactly one year, quarter, month or Monday-start week segment of a
 * month (the first and last week are cut at the month boundary).
 */
public final class GoalPeriods {

    private GoalPeriods() {
    }

    /** The canonical period of {@code type} that contains {@code date}. */
    public static LocalDate[] containing(GoalType type, LocalDate date) {
        return switch (type) {
            case YEAR -> new LocalDate[] {date.withDayOfYear(1), date.with(TemporalAdjusters.lastDayOfYear())};
            case QUARTER -> {
                int firstMonth = (date.getMonthValue() - 1) / 3 * 3 + 1;
                YearMonth last = YearMonth.of(date.getYear(), firstMonth + 2);
                yield new LocalDate[] {LocalDate.of(date.getYear(), firstMonth, 1), last.atEndOfMonth()};
            }
            case MONTH -> new LocalDate[] {date.withDayOfMonth(1), YearMonth.from(date).atEndOfMonth()};
            case WEEK -> {
                LocalDate monday = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                LocalDate sunday = date.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
                LocalDate monthStart = date.withDayOfMonth(1);
                LocalDate monthEnd = YearMonth.from(date).atEndOfMonth();
                yield new LocalDate[] {
                    monday.isBefore(monthStart) ? monthStart : monday,
                    sunday.isAfter(monthEnd) ? monthEnd : sunday
                };
            }
        };
    }

    public static boolean isCanonical(GoalType type, LocalDate startDate, LocalDate endDate) {
        LocalDate[] canonical = containing(type, startDate);
        return canonical[0].equals(startDate) && canonical[1].equals(endDate);
    }
}
