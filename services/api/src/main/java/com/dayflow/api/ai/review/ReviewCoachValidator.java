package com.dayflow.api.ai.review;

import static com.dayflow.api.ai.review.ReviewCoachPrompt.MAX_HEADLINE;
import static com.dayflow.api.ai.review.ReviewCoachPrompt.MAX_ITEMS;
import static com.dayflow.api.ai.review.ReviewCoachPrompt.MAX_KEYS;
import static com.dayflow.api.ai.review.ReviewCoachPrompt.MAX_MESSAGE;
import static com.dayflow.api.ai.review.ReviewCoachPrompt.MAX_REASON;
import static com.dayflow.api.ai.review.ReviewCoachPrompt.MAX_SUMMARY;
import static com.dayflow.api.ai.review.ReviewCoachPrompt.MAX_TEXT;

import com.dayflow.api.ai.AiProviderException;
import com.dayflow.api.ai.CoachClaims;
import com.dayflow.api.ai.CoachText;
import com.dayflow.api.ai.review.ReviewCoachDtos.ReviewCoachResponse;
import com.dayflow.api.ai.review.ReviewCoachDtos.ReviewDraftItem;
import com.dayflow.api.ai.review.ReviewCoachDtos.ReviewEvidence;
import com.dayflow.api.ai.review.ReviewCoachDtos.ReviewHighlight;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * Turns the untrusted model answer into a {@link ReviewCoachResponse} (pure: no database, no provider).
 *
 * <p>Every line must stand on backend facts:
 * <ul>
 *   <li>evidence keys must exist in the context; a line without a valid key is dropped</li>
 *   <li>numbers in factual text (headline, summary, highlights, KEEP/PROBLEM, every reason) must appear in the
 *       context's evidence labels or the period dates; clock times ("8시") are allowed. A TRY's own text is a plan,
 *       so its numbers ("하루 최대 1개") are not checked.</li>
 *   <li>time-of-day and weekday claims need a cited TIME_* / WEEKDAY_* key, which only exists with enough sample</li>
 *   <li>guessed causes (willpower, fatigue, focus, health, personality) and vague TRYs are dropped</li>
 *   <li>refs, evidence keys and enums are replaced for the user ({@link CoachText}); duplicate lines are removed;
 *       counts and lengths are capped. Repeats of lines the user already saved are removed by the client when
 *       appending, so "replace" still gets the full draft.</li>
 * </ul>
 */
final class ReviewCoachValidator {

    static final String FALLBACK_HEADLINE = "이번 기간 기록을 정리했어요";

    static final Map<String, String> ENUM_WORDS;

    static {
        Map<String, String> words = new HashMap<>(CoachText.PLANNING_ENUM_WORDS);
        words.putAll(Map.ofEntries(
                Map.entry("KEEP", "Keep"), Map.entry("PROBLEM", "Problem"), Map.entry("TRY", "Try"),
                Map.entry("REDUCE", "작게 줄이기"), Map.entry("MOVE", "날짜 바꾸기"), Map.entry("CARRY_OVER", "다음 계획으로 이어가기"),
                Map.entry("DROP", "이번에는 내려놓기"), Map.entry("COMPLETED", "완료"),
                Map.entry("MORNING", "오전"), Map.entry("AFTERNOON", "오후"), Map.entry("EVENING", "저녁"),
                Map.entry("LATE_NIGHT", "밤"), Map.entry("MONDAY", "월요일"), Map.entry("TUESDAY", "화요일"),
                Map.entry("WEDNESDAY", "수요일"), Map.entry("THURSDAY", "목요일"), Map.entry("FRIDAY", "금요일"),
                Map.entry("SATURDAY", "토요일"), Map.entry("SUNDAY", "일요일"), Map.entry("CALENDAR", "계획 목표"),
                Map.entry("PERIOD", "기간 목표")));
        ENUM_WORDS = Map.copyOf(words);
    }

    /** Shared claim rules ({@link CoachClaims}). */
    static final Pattern UNSUPPORTED_CAUSE = CoachClaims.UNSUPPORTED_CAUSE;

    /** A claim that an earlier TRY worked or was followed; it needs a before/after PREVIOUS_* fact. */
    private static final Pattern PREVIOUS_EFFECT = Pattern.compile(
            "(지난|이전).*(지켜|지켰|방지|효과|개선|반영|줄었|늘었|줄어|늘어|적용)");

    private static final Pattern TIME_WORDS = CoachClaims.TIME_WORDS;
    private static final Pattern WEEKDAY_WORDS = CoachClaims.WEEKDAY_WORDS;

    private ReviewCoachValidator() {
    }

    static ReviewCoachResponse validate(JsonNode output, ReviewCoachContext context, Instant generatedAt) {
        if (output == null || !output.isObject()) {
            throw new AiProviderException(AiProviderException.Kind.INVALID_OUTPUT, "Answer is not a JSON object.");
        }
        Checks checks = new Checks(context);
        String headline = text(output.path("headline"), MAX_HEADLINE, context);
        if (headline.isEmpty()) {
            throw new AiProviderException(AiProviderException.Kind.INVALID_OUTPUT, "Answer has no headline.");
        }
        if (!checks.factual(headline, Set.of(), true)) {
            headline = FALLBACK_HEADLINE;
        }
        String summary = text(output.path("summary"), MAX_SUMMARY, context);
        if (!checks.factual(summary, Set.of(), true)) {
            summary = "";
        }

        List<ReviewHighlight> highlights = new ArrayList<>();
        for (JsonNode item : output.path("highlights")) {
            if (highlights.size() == MAX_ITEMS) {
                break;
            }
            String message = text(item.path("message"), MAX_MESSAGE, context);
            List<ReviewEvidence> evidence = evidence(item.path("evidenceKeys"), context);
            if (!message.isEmpty() && !evidence.isEmpty() && checks.factual(message, keys(evidence), false)
                    && checks.unique(message)) {
                highlights.add(new ReviewHighlight(message, evidence));
            }
        }

        List<ReviewDraftItem> keep = drafts(output.path("keep"), context, checks, false);
        List<ReviewDraftItem> problem = drafts(output.path("problem"), context, checks, false);
        List<ReviewDraftItem> tryItems = drafts(output.path("try"), context, checks, true);

        List<ReviewEvidence> facts = context.factKeys().stream()
                .map(key -> new ReviewEvidence(key, context.evidence().get(key))).toList();
        return new ReviewCoachResponse(generatedAt, context.type(), context.periodStart(), context.periodEnd(), headline,
                summary, highlights, keep, problem, tryItems, facts);
    }

    private static List<ReviewDraftItem> drafts(JsonNode items, ReviewCoachContext context, Checks checks, boolean isTry) {
        List<ReviewDraftItem> result = new ArrayList<>();
        for (JsonNode item : items) {
            if (result.size() == MAX_ITEMS) {
                break;
            }
            String text = text(item.path("text"), MAX_TEXT, context);
            String reason = text(item.path("reason"), MAX_REASON, context);
            List<ReviewEvidence> evidence = evidence(item.path("evidenceKeys"), context);
            if (text.isEmpty() || evidence.isEmpty()) {
                continue;
            }
            Set<String> cited = keys(evidence);
            // A TRY's text is a plan for the next period: no fact checks on it, only the cause/vagueness filter.
            boolean textOk = isTry ? checks.noUnsupportedCause(text) : checks.factual(text, cited, false);
            boolean reasonOk = reason.isEmpty() || checks.factual(reason, cited, false);
            if (textOk && reasonOk && checks.unique(text)) {
                result.add(new ReviewDraftItem(text, reason, evidence));
            }
        }
        return result;
    }

    /** Stateful checks of one answer (duplicates across all lines). */
    private static final class Checks {
        private final ReviewCoachContext context;
        private final Set<String> allowedNumbers = new HashSet<>();
        private final Set<String> seen = new HashSet<>();

        Checks(ReviewCoachContext context) {
            this.context = context;
            allowedNumbers.addAll(CoachClaims.numbersIn(context.evidence().values()));
            CoachClaims.addDate(allowedNumbers, context.periodStart());
            CoachClaims.addDate(allowedNumbers, context.periodEnd());
        }

        /**
         * A factual sentence: no guessed cause, only numbers the backend computed, and time-of-day / weekday claims
         * only with a cited pattern key. Headline and summary cite nothing, so any pattern key of the context counts.
         */
        boolean factual(String text, Set<String> cited, boolean summaryLevel) {
            if (text.isEmpty()) {
                return true;
            }
            String own = CoachText.withoutTitles(text, context.titles());
            if (!noUnsupportedCause(text)) {
                return false;
            }
            if (PREVIOUS_EFFECT.matcher(own).find()
                    && cited.stream().noneMatch(key -> key.startsWith("PREVIOUS_") && !key.equals("PREVIOUS_TRY"))) {
                return false;
            }
            if (!CoachClaims.numbersAllowed(own, allowedNumbers)) {
                return false;
            }
            if (TIME_WORDS.matcher(own).find() && !citesAny(cited, context.timeEvidenceKeys(), summaryLevel)
                    && !cited.contains("PATTERN_SAMPLE_LIMITED")) {
                return false;
            }
            return !WEEKDAY_WORDS.matcher(own).find() || citesAny(cited, context.weekdayEvidenceKeys(), summaryLevel);
        }

        boolean noUnsupportedCause(String text) {
            return !UNSUPPORTED_CAUSE.matcher(CoachText.withoutTitles(text, context.titles())).find();
        }

        private boolean citesAny(Set<String> cited, Set<String> patternKeys, boolean summaryLevel) {
            if (summaryLevel) {
                return !patternKeys.isEmpty();
            }
            return cited.stream().anyMatch(patternKeys::contains);
        }

        boolean unique(String text) {
            return seen.add(normalize(text));
        }
    }

    private static List<ReviewEvidence> evidence(JsonNode keys, ReviewCoachContext context) {
        List<ReviewEvidence> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode node : keys) {
            String key = node.isString() ? node.asString().strip() : "";
            String label = context.evidence().get(key);
            if (label != null && seen.add(key) && result.size() < MAX_KEYS) {
                result.add(new ReviewEvidence(key, label));
            }
        }
        return result;
    }

    private static Set<String> keys(List<ReviewEvidence> evidence) {
        Set<String> keys = new HashSet<>();
        evidence.forEach(item -> keys.add(item.key()));
        return keys;
    }

    private static String text(JsonNode node, int max, ReviewCoachContext context) {
        if (!node.isString()) {
            return "";
        }
        String clean = CoachText.clip(node.asString(), 1000);
        return CoachText.clip(CoachText.userFacing(clean, vocabulary(context)), max);
    }

    static CoachText.Vocabulary vocabulary(ReviewCoachContext context) {
        return new CoachText.Vocabulary(context.refNames(), context.evidence(), context.titles(), ENUM_WORDS);
    }

    /** Comparison form of a KPT line: no spaces, punctuation or case. */
    static String normalize(String text) {
        return text == null ? "" : text.replaceAll("[\\s\\p{Punct}‘’“”·…]", "").toLowerCase();
    }
}
