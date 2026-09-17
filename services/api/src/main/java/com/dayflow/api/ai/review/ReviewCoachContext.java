package com.dayflow.api.ai.review;

import com.dayflow.api.review.ReviewType;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What the Review Coach knows about one period of the current user, built by {@link ReviewCoachContextService}.
 *
 * @param data              the JSON document sent to the model (refs instead of ids, labels with the numbers)
 * @param evidence          evidence key → label, in context order; the only numbers a draft may rely on
 * @param timeEvidenceKeys  keys about time-of-day groups (only present with enough sample)
 * @param weekdayEvidenceKeys keys about weekday groups (only present with enough sample)
 * @param refNames          internal ref (D1, G1) → title, for the user-facing text sanitizer
 * @param titles            the user's own Day/Goal/review titles (never judged or rewritten)
 * @param factKeys          evidence keys shown to the user as the period's facts
 */
public record ReviewCoachContext(
        ReviewType type,
        LocalDate periodStart,
        LocalDate periodEnd,
        Map<String, Object> data,
        Map<String, String> evidence,
        Set<String> timeEvidenceKeys,
        Set<String> weekdayEvidenceKeys,
        Map<String, String> refNames,
        List<String> titles,
        List<String> factKeys) {
}
