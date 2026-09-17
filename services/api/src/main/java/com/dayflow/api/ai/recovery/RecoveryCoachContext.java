package com.dayflow.api.ai.recovery;

import com.dayflow.api.recovery.RecoveryAction;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * What the Recovery Coach knows, built by {@link RecoveryCoachContextService}.
 *
 * @param data            the JSON document sent to the model
 * @param candidates      detailed candidates by ref (D1, D2 …)
 * @param evidence        evidence key → label (the only numbers an answer may use)
 * @param titles          the user's own titles (never judged or rewritten)
 * @param candidateCount  all Recovery candidates now
 */
public record RecoveryCoachContext(
        LocalDate today,
        Map<String, Object> data,
        Map<String, Candidate> candidates,
        Map<String, String> evidence,
        List<String> titles,
        int candidateCount) {

    /**
     * One candidate with what the domain allows for it.
     *
     * @param moveDates       dates a MOVE may use (today or later, inside the Goal period)
     * @param carryOverDates  dates a CARRY_OVER may use (only for a CALENDAR WEEK Goal Day not carried yet)
     * @param dropSupported   DayFlow's own conservative signal that letting go is defensible
     * @param keys            evidence keys about this Day
     */
    public record Candidate(UUID dayId, String title, Set<RecoveryAction> allowedActions, Set<LocalDate> moveDates,
            Set<LocalDate> carryOverDates, boolean dropSupported, Set<String> keys) {
    }
}
