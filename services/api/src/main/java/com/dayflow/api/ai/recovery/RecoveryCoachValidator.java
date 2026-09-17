package com.dayflow.api.ai.recovery;

import static com.dayflow.api.ai.recovery.RecoveryCoachPrompt.MAX_HEADLINE;
import static com.dayflow.api.ai.recovery.RecoveryCoachPrompt.MAX_KEYS;
import static com.dayflow.api.ai.recovery.RecoveryCoachPrompt.MAX_MESSAGE;
import static com.dayflow.api.ai.recovery.RecoveryCoachPrompt.MAX_OBSERVATIONS;
import static com.dayflow.api.ai.recovery.RecoveryCoachPrompt.MAX_REASON;
import static com.dayflow.api.ai.recovery.RecoveryCoachPrompt.MAX_SUMMARY;

import com.dayflow.api.ai.AiProviderException;
import com.dayflow.api.ai.CoachClaims;
import com.dayflow.api.ai.CoachFact;
import com.dayflow.api.ai.CoachText;
import com.dayflow.api.ai.recovery.RecoveryCoachContext.Candidate;
import com.dayflow.api.ai.recovery.RecoveryCoachDtos.RecoveryCoachObservation;
import com.dayflow.api.ai.recovery.RecoveryCoachDtos.RecoveryCoachResponse;
import com.dayflow.api.ai.recovery.RecoveryCoachDtos.RecoveryRecommendation;
import com.dayflow.api.recovery.RecoveryAction;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;

/**
 * Turns the untrusted model answer into a {@link RecoveryCoachResponse} (pure). A recommendation survives only if it
 * could be applied through the normal Recovery flow and is backed by DayFlow's facts:
 * <ul>
 *   <li>the Day ref is one of the candidates (other ids never resolve), at most one recommendation per Day</li>
 *   <li>the action is in that Day's allowedActions (a PERIOD Goal Day never gets CARRY_OVER)</li>
 *   <li>MOVE / CARRY_OVER dates are one of the dates offered for that Day; other actions carry no date</li>
 *   <li>DROP only where DayFlow's own dropSupported signal holds and the reason cites the overdue or history fact</li>
 *   <li>valid evidence keys, only computed numbers, no guessed causes, difficulty or availability</li>
 * </ul>
 * An applicable non-DROP recommendation whose wording fails (or that cites no valid key) keeps its action with the Day's
 * own facts as evidence and reason. Dropped items are logged with a cause code only (never text).
 */
final class RecoveryCoachValidator {

    private static final Logger log = LoggerFactory.getLogger(RecoveryCoachValidator.class);

    static final String FALLBACK_HEADLINE = "남은 Day를 정리할 방법을 골라봤어요";

    static final Map<String, String> ENUM_WORDS;

    static {
        Map<String, String> words = new HashMap<>(CoachText.PLANNING_ENUM_WORDS);
        RecoveryCoachContextService.ACTION_LABEL.forEach((action, label) -> words.put(action.name(), label));
        words.put("PAST_DATE", "지난 날짜");
        words.put("TIME_PASSED", "시간이 지남");
        words.put("PERIOD", "기간 목표");
        words.put("CALENDAR", "계획 목표");
        ENUM_WORDS = Map.copyOf(words);
    }

    private RecoveryCoachValidator() {
    }

    static RecoveryCoachResponse validate(JsonNode output, RecoveryCoachContext context, Instant generatedAt) {
        if (output == null || !output.isObject()) {
            throw new AiProviderException(AiProviderException.Kind.INVALID_OUTPUT, "Answer is not a JSON object.");
        }
        Set<String> allowedNumbers = CoachClaims.numbersIn(context.evidence().values());
        CoachClaims.addDate(allowedNumbers, context.today());

        String headline = text(output.path("headline"), MAX_HEADLINE, context);
        if (headline.isEmpty()) {
            throw new AiProviderException(AiProviderException.Kind.INVALID_OUTPUT, "Answer has no headline.");
        }
        if (!factual(headline, context, allowedNumbers)) {
            headline = FALLBACK_HEADLINE;
        }
        String summary = text(output.path("summary"), MAX_SUMMARY, context);
        if (!factual(summary, context, allowedNumbers)) {
            summary = "";
        }

        List<RecoveryCoachObservation> observations = new ArrayList<>();
        for (JsonNode item : output.path("observations")) {
            if (observations.size() == MAX_OBSERVATIONS) {
                break;
            }
            String message = text(item.path("message"), MAX_MESSAGE, context);
            List<CoachFact> evidence = evidence(item.path("evidenceKeys"), context);
            if (!message.isEmpty() && !evidence.isEmpty() && factual(message, context, allowedNumbers)
                    && weekdaysOk(message, context, evidence, List.of())) {
                observations.add(new RecoveryCoachObservation(message, evidence));
            }
        }

        List<RecoveryRecommendation> recommendations = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode item : output.path("recommendations")) {
            String ref = item.path("dayRef").asString("");
            Candidate candidate = context.candidates().get(ref);
            if (candidate == null || seen.contains(ref)) {
                dropped(candidate == null ? "unknown" : ref, candidate == null ? "unknown_ref" : "duplicate");
                continue;
            }
            RecoveryRecommendation recommendation = recommendation(item, ref, candidate, context, allowedNumbers);
            if (recommendation != null) {
                seen.add(ref);
                recommendations.add(recommendation);
            }
        }
        // Weekdays in the headline and summary must belong to what was kept (a cited fact or a recommended date).
        List<CoachFact> kept = new ArrayList<>();
        List<LocalDate> keptDates = new ArrayList<>();
        observations.forEach(observation -> kept.addAll(observation.evidence()));
        recommendations.forEach(recommendation -> {
            kept.addAll(recommendation.evidence());
            if (recommendation.targetDate() != null) {
                keptDates.add(recommendation.targetDate());
            }
        });
        if (!weekdaysOk(headline, context, kept, keptDates)) {
            headline = FALLBACK_HEADLINE;
        }
        if (!weekdaysOk(summary, context, kept, keptDates)) {
            summary = "";
        }
        return new RecoveryCoachResponse(generatedAt, context.today(), headline, summary, observations, recommendations,
                context.candidateCount(), context.candidates().size());
    }

    private static RecoveryRecommendation recommendation(JsonNode item, String ref, Candidate candidate,
            RecoveryCoachContext context, Set<String> allowedNumbers) {
        RecoveryAction action = action(item.path("action"));
        if (action == null || !candidate.allowedActions().contains(action)) {
            return dropped(ref, "action_not_allowed");
        }
        LocalDate targetDate = null;
        if (action == RecoveryAction.MOVE || action == RecoveryAction.CARRY_OVER) {
            targetDate = date(item.path("targetDate"));
            Set<LocalDate> offered = action == RecoveryAction.MOVE ? candidate.moveDates() : candidate.carryOverDates();
            if (targetDate == null || !offered.contains(targetDate)) {
                return dropped(ref, "date_not_offered");
            }
        }
        String reason = text(item.path("reason"), MAX_REASON, context);
        List<CoachFact> evidence = evidence(item.path("evidenceKeys"), context);
        boolean wordingOk = !reason.isEmpty() && factual(reason, context, allowedNumbers)
                && weekdaysOk(reason, context, evidence, targetDate == null ? List.of() : List.of(targetDate));
        if (action == RecoveryAction.DROP) {
            // DROP stays strict: DayFlow's own support signal, a cited overdue/history fact and factual wording.
            boolean citesSignal = evidence.stream().anyMatch(fact ->
                    fact.key().equals("HISTORY_" + ref) || fact.key().equals("OVERDUE_" + ref));
            if (!candidate.dropSupported() || !citesSignal || !wordingOk) {
                return dropped(ref, "drop_not_supported");
            }
            return new RecoveryRecommendation(candidate.dayId(), candidate.title(), action, null, reason, evidence);
        }
        if (evidence.isEmpty()) {
            evidence = ownFacts(ref, targetDate, context);
        }
        if (evidence.isEmpty()) {
            return dropped(ref, "no_evidence");
        }
        if (!wordingOk) {
            log.info("ai.coach task={} kept ref={} cause=reason_replaced", RecoveryCoachPrompt.TASK, ref);
            reason = CoachClaims.reasonFromEvidence(evidence, MAX_REASON);
        }
        return new RecoveryRecommendation(candidate.dayId(), candidate.title(), action, targetDate, reason, evidence);
    }

    /** The Day's overdue fact and, for a date, that date's load: true facts DayFlow computed for this Day. */
    private static List<CoachFact> ownFacts(String ref, LocalDate targetDate, RecoveryCoachContext context) {
        List<String> keys = new ArrayList<>(List.of("OVERDUE_" + ref));
        if (targetDate != null) {
            keys.add(RecoveryCoachContextService.loadKey(targetDate));
        }
        List<CoachFact> facts = new ArrayList<>();
        for (String key : keys) {
            String label = context.evidence().get(key);
            if (label != null) {
                facts.add(new CoachFact(key, label));
            }
        }
        return facts;
    }

    private static boolean weekdaysOk(String text, RecoveryCoachContext context, List<CoachFact> facts, List<LocalDate> dates) {
        return CoachClaims.weekdaysAllowed(CoachText.withoutTitles(text, context.titles()), CoachClaims.weekdays(facts, dates));
    }

    private static RecoveryRecommendation dropped(String ref, String cause) {
        log.info("ai.coach task={} dropped ref={} cause={}", RecoveryCoachPrompt.TASK, ref, cause);
        return null;
    }

    /** No guessed cause, difficulty or availability, and only numbers DayFlow computed (or today's date). */
    static boolean factual(String text, RecoveryCoachContext context, Set<String> allowedNumbers) {
        if (text.isEmpty()) {
            return true;
        }
        String own = CoachText.withoutTitles(text, context.titles());
        return !CoachClaims.UNSUPPORTED_CAUSE.matcher(own).find()
                && !CoachClaims.SUBJECTIVE_DIFFICULTY.matcher(own).find()
                && !CoachClaims.AVAILABILITY_GUESS.matcher(own).find()
                && CoachClaims.numbersAllowed(own, allowedNumbers);
    }

    private static List<CoachFact> evidence(JsonNode keys, RecoveryCoachContext context) {
        List<CoachFact> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode node : keys) {
            String key = node.isString() ? CoachClaims.normalizeKey(node.asString()) : "";
            String label = context.evidence().get(key);
            if (label != null && seen.add(key) && result.size() < MAX_KEYS) {
                result.add(new CoachFact(key, label));
            }
        }
        return result;
    }

    private static RecoveryAction action(JsonNode node) {
        try {
            return node.isString() ? RecoveryAction.valueOf(node.asString()) : null;
        } catch (IllegalArgumentException unknown) {
            return null;
        }
    }

    private static LocalDate date(JsonNode node) {
        try {
            return node.isString() ? LocalDate.parse(node.asString()) : null;
        } catch (DateTimeParseException invalid) {
            return null;
        }
    }

    private static String text(JsonNode node, int max, RecoveryCoachContext context) {
        if (!node.isString()) {
            return "";
        }
        Map<String, String> refNames = new HashMap<>();
        context.candidates().forEach((ref, candidate) -> refNames.put(ref, candidate.title()));
        String clean = CoachText.clip(node.asString(), 1000);
        return CoachText.clip(CoachText.userFacing(clean,
                new CoachText.Vocabulary(refNames, context.evidence(), context.titles(), ENUM_WORDS)), max);
    }
}
