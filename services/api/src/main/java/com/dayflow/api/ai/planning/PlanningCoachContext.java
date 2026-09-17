package com.dayflow.api.ai.planning;

import com.dayflow.api.day.DayPriority;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * What the Planning Coach knows about one planned period, built by {@link PlanningCoachContextService}.
 *
 * @param plannableDates dates of the period from today on (the only dates a suggestion may use)
 * @param days           detailed Days by ref (D1 …) with what may change for each
 * @param evidence       evidence key → label (the only numbers an answer may use)
 * @param tryLines       PREVIOUS_TRY_n key → the TRY text (the only basis for a new Day proposal)
 * @param titles         the user's own titles and TRY lines (never judged or rewritten)
 * @param factKeys       evidence keys shown to the user as facts
 */
public record PlanningCoachContext(
        UUID goalId,
        String goalTitle,
        LocalDate targetStart,
        LocalDate targetEnd,
        Set<LocalDate> plannableDates,
        Map<String, Object> data,
        Map<String, DayOption> days,
        Map<String, String> evidence,
        Map<String, String> tryLines,
        List<String> titles,
        List<String> factKeys) {

    /**
     * @param dateOptions     dates a SET_DATE may use (plannable, inside the Goal, not the current date)
     * @param start           current local start of the time placement, or null without one
     * @param durationMinutes current placement duration (0 without one); SET_SCHEDULE keeps it
     */
    public record DayOption(UUID dayId, String title, boolean finished, DayPriority priority, LocalDate plannedDate,
            Set<LocalDate> dateOptions, LocalTime start, long durationMinutes) {

        public boolean scheduled() {
            return start != null && durationMinutes > 0;
        }
    }
}
