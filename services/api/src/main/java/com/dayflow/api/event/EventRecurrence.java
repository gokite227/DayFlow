package com.dayflow.api.event;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** EVT-003 minimal recurrence. Every occurrence is computed from the original anchor date. */
public enum EventRecurrence {
    NONE,
    DAILY,
    WEEKLY,
    MONTHLY,
    YEARLY;

    /**
     * Date of the n-th occurrence (0 = the anchor). plusMonths/plusYears clamp to the last day of
     * the target month, and because n is always counted from the anchor, Jan 31 gives Feb 28/29
     * and then Mar 31 (no drift to Mar 28).
     */
    public LocalDate nth(LocalDate anchor, long n) {
        return switch (this) {
            case NONE -> anchor;
            case DAILY -> anchor.plusDays(n);
            case WEEKLY -> anchor.plusWeeks(n);
            case MONTHLY -> anchor.plusMonths(n);
            case YEARLY -> anchor.plusYears(n);
        };
    }

    /** A safe starting index: no occurrence before it can start on or after {@code earliest}. */
    long firstIndexNotAfter(LocalDate anchor, LocalDate earliest) {
        if (this == NONE || !earliest.isAfter(anchor)) {
            return 0;
        }
        long units = switch (this) {
            case DAILY -> ChronoUnit.DAYS.between(anchor, earliest);
            case WEEKLY -> ChronoUnit.WEEKS.between(anchor, earliest);
            case MONTHLY -> ChronoUnit.MONTHS.between(anchor, earliest);
            case YEARLY -> ChronoUnit.YEARS.between(anchor, earliest);
            case NONE -> 0;
        };
        return Math.max(0, units - 1);
    }
}
