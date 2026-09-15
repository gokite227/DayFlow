package com.dayflow.api.review;

import java.time.LocalDate;

/** REV-001 review periods. */
public enum ReviewType {
    DAY,
    WEEK,
    MONTH,
    QUARTER,
    YEAR;

    /**
     * The last date of the period starting at {@code start}, or null when {@code start} is not a
     * valid start for this type. WEEK accepts any start day because the week start is a user setting.
     */
    public LocalDate periodEnd(LocalDate start) {
        return switch (this) {
            case DAY -> start;
            case WEEK -> start.plusDays(6);
            case MONTH -> start.getDayOfMonth() == 1 ? start.plusMonths(1).minusDays(1) : null;
            case QUARTER -> start.getDayOfMonth() == 1 && (start.getMonthValue() - 1) % 3 == 0
                    ? start.plusMonths(3).minusDays(1)
                    : null;
            case YEAR -> start.getDayOfYear() == 1 ? start.plusYears(1).minusDays(1) : null;
        };
    }
}
