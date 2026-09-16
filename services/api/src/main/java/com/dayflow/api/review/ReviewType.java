package com.dayflow.api.review;

import com.dayflow.api.goal.GoalType;
import java.time.LocalDate;

/** REV-001 review periods. */
public enum ReviewType {
    DAY,
    WEEK,
    MONTH,
    QUARTER,
    YEAR;

    /** The Goal level a review looks at (prototype: daily and weekly reviews use WEEK Goals). */
    public GoalType goalType() {
        return switch (this) {
            case DAY, WEEK -> GoalType.WEEK;
            case MONTH -> GoalType.MONTH;
            case QUARTER -> GoalType.QUARTER;
            case YEAR -> GoalType.YEAR;
        };
    }

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
