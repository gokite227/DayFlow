package com.dayflow.api.ai.planning;

import static com.dayflow.api.ai.planning.PlanningCoachPrompt.MAX_HEADLINE;
import static com.dayflow.api.ai.planning.PlanningCoachPrompt.MAX_KEYS;
import static com.dayflow.api.ai.planning.PlanningCoachPrompt.MAX_MESSAGE;
import static com.dayflow.api.ai.planning.PlanningCoachPrompt.MAX_OBSERVATIONS;
import static com.dayflow.api.ai.planning.PlanningCoachPrompt.MAX_PROPOSALS;
import static com.dayflow.api.ai.planning.PlanningCoachPrompt.MAX_REASON;
import static com.dayflow.api.ai.planning.PlanningCoachPrompt.MAX_SUGGESTIONS;
import static com.dayflow.api.ai.planning.PlanningCoachPrompt.MAX_SUMMARY;
import static com.dayflow.api.ai.planning.PlanningCoachPrompt.MAX_TITLE;

import com.dayflow.api.ai.AiProviderException;
import com.dayflow.api.ai.CoachClaims;
import com.dayflow.api.ai.CoachFact;
import com.dayflow.api.ai.CoachText;
import com.dayflow.api.ai.planning.PlanningCoachContext.DayOption;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningCoachObservation;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningCoachResponse;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningDayProposal;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningDaySuggestion;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningSuggestionType;
import com.dayflow.api.day.DayPriority;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;

/**
 * Turns the untrusted model answer into a {@link PlanningCoachResponse} (pure). Every suggestion must be applicable
 * with the normal Day API and backed by DayFlow's facts:
 * <ul>
 *   <li>Day refs of the context only (other users' or invented ids never resolve), never a finished Day, one per Day</li>
 *   <li>SET_DATE: one of the Day's date options (inside the period and the Goal, from today, not the current date)</li>
 *   <li>SET_SCHEDULE: only a Day that already has a placement; a plannable date, a valid HH:mm, the same duration,
 *       ending the same day, and not the current placement</li>
 *   <li>SET_PRIORITY: a valid, different priority; at most one raise to HIGH across suggestions and proposals</li>
 *   <li>new Day proposals: at most two, one per date, citing a previous Review TRY whose words the title reuses,
 *       not a copy of an existing Day, created without a Goal-period violation (plannable date or none)</li>
 *   <li>valid evidence keys; only computed numbers; no guessed causes, difficulty or free time; refs/keys/enums
 *       rewritten for the user</li>
 * </ul>
 */
final class PlanningCoachValidator {

    private static final Logger log = LoggerFactory.getLogger(PlanningCoachValidator.class);

    static final String FALLBACK_HEADLINE = "다음 기간 계획을 점검했어요";
    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");
    private static final Pattern WORD = Pattern.compile("[가-힣A-Za-z0-9]{2,}");

    static final Map<String, String> ENUM_WORDS;

    static {
        Map<String, String> words = new HashMap<>(CoachText.PLANNING_ENUM_WORDS);
        words.put("SET_DATE", "날짜 정하기");
        words.put("SET_SCHEDULE", "시간 옮기기");
        words.put("EVENING", "저녁");
        words.put("MORNING", "오전");
        words.put("AFTERNOON", "오후");
        words.put("LATE_NIGHT", "밤");
        words.put("UNDATED", "날짜 미정");
        words.put("IN_PERIOD", "이 기간");
        words.put("BEFORE_PERIOD", "이전 기간");
        ENUM_WORDS = Map.copyOf(words);
    }

    private PlanningCoachValidator() {
    }

    static PlanningCoachResponse validate(JsonNode output, PlanningCoachContext context, Instant generatedAt) {
        if (output == null || !output.isObject()) {
            throw new AiProviderException(AiProviderException.Kind.INVALID_OUTPUT, "Answer is not a JSON object.");
        }
        Set<String> allowedNumbers = CoachClaims.numbersIn(context.evidence().values());
        context.plannableDates().forEach(date -> CoachClaims.addDate(allowedNumbers, date));
        CoachClaims.addDate(allowedNumbers, context.targetStart());
        CoachClaims.addDate(allowedNumbers, context.targetEnd());

        String headline = text(output.path("headline"), MAX_HEADLINE, context);
        if (headline.isEmpty()) {
            throw new AiProviderException(AiProviderException.Kind.INVALID_OUTPUT, "Answer has no headline.");
        }
        if (!factual(headline, Set.of(), true, context, allowedNumbers)) {
            headline = FALLBACK_HEADLINE;
        }
        String summary = text(output.path("summary"), MAX_SUMMARY, context);
        if (!factual(summary, Set.of(), true, context, allowedNumbers)) {
            summary = "";
        }

        List<PlanningCoachObservation> observations = new ArrayList<>();
        for (JsonNode item : output.path("observations")) {
            if (observations.size() == MAX_OBSERVATIONS) {
                break;
            }
            String message = text(item.path("message"), MAX_MESSAGE, context);
            List<CoachFact> evidence = evidence(item.path("evidenceKeys"), context);
            if (!message.isEmpty() && !evidence.isEmpty() && factual(message, keys(evidence), false, context, allowedNumbers)
                    && weekdaysOk(message, context, evidence, List.of())) {
                observations.add(new PlanningCoachObservation(message, evidence));
            }
        }

        int[] highRaises = {0};
        List<PlanningDaySuggestion> suggestions = new ArrayList<>();
        Set<String> seenDays = new HashSet<>();
        for (JsonNode item : output.path("existingDaySuggestions")) {
            if (suggestions.size() == MAX_SUGGESTIONS) {
                break;
            }
            String ref = item.path("dayRef").asString("");
            DayOption day = context.days().get(ref);
            if (day == null || day.finished() || seenDays.contains(ref)) {
                dropped(day == null ? "unknown" : ref, day == null ? "unknown_ref" : "finished_or_duplicate");
                continue;
            }
            PlanningDaySuggestion suggestion = suggestion(item, day, context, allowedNumbers, highRaises);
            if (suggestion != null) {
                seenDays.add(ref);
                suggestions.add(suggestion);
            }
        }

        List<PlanningDayProposal> proposals = new ArrayList<>();
        Set<LocalDate> proposalDates = new HashSet<>();
        Set<String> proposalTitles = new HashSet<>();
        context.days().values().forEach(day -> proposalTitles.add(normalize(day.title())));
        for (JsonNode item : output.path("newDayProposals")) {
            if (proposals.size() == MAX_PROPOSALS) {
                break;
            }
            PlanningDayProposal proposal = proposal(item, context, allowedNumbers, highRaises, proposalDates, proposalTitles);
            if (proposal != null) {
                proposals.add(proposal);
            }
        }

        // Weekdays in the headline and summary must belong to what was kept (a cited fact or a suggested date).
        List<CoachFact> kept = new ArrayList<>();
        List<LocalDate> keptDates = new ArrayList<>();
        observations.forEach(observation -> kept.addAll(observation.evidence()));
        suggestions.forEach(suggestion -> {
            kept.addAll(suggestion.evidence());
            if (suggestion.targetDate() != null) {
                keptDates.add(suggestion.targetDate());
            }
        });
        proposals.forEach(proposal -> {
            kept.addAll(proposal.evidence());
            if (proposal.proposedDate() != null) {
                keptDates.add(proposal.proposedDate());
            }
        });
        if (!weekdaysOk(headline, context, kept, keptDates)) {
            headline = FALLBACK_HEADLINE;
        }
        if (!weekdaysOk(summary, context, kept, keptDates)) {
            summary = "";
        }
        List<CoachFact> facts = context.factKeys().stream().map(key -> new CoachFact(key, context.evidence().get(key))).toList();
        return new PlanningCoachResponse(generatedAt, context.goalId(), context.targetStart(), context.targetEnd(), headline,
                summary, observations, suggestions, proposals, facts);
    }

    private static PlanningDaySuggestion suggestion(JsonNode item, DayOption day, PlanningCoachContext context,
            Set<String> allowedNumbers, int[] highRaises) {
        PlanningSuggestionType type = enumValue(PlanningSuggestionType.class, item.path("type"));
        if (type == null) {
            return dropped(item.path("dayRef").asString(""), "unknown_type");
        }
        String reason = text(item.path("reason"), MAX_REASON, context);
        List<CoachFact> evidence = evidence(item.path("evidenceKeys"), context);
        LocalDate asked = date(item.path("targetDate"));
        if (evidence.isEmpty() && asked != null
                && (type == PlanningSuggestionType.SET_DATE || type == PlanningSuggestionType.SET_SCHEDULE)) {
            // The load of the date the Day would go to: a fact DayFlow computed for exactly this change.
            String key = PlanningCoachContextService.loadKey(asked);
            if (context.evidence().containsKey(key)) {
                evidence = List.of(new CoachFact(key, context.evidence().get(key)));
            }
        }
        if (evidence.isEmpty()) {
            return dropped(item.path("dayRef").asString(""), "no_evidence");
        }
        if (type == PlanningSuggestionType.SET_PRIORITY
                && evidence.stream().allMatch(fact -> fact.key().startsWith("LOAD_"))) {
            // A crowded date is handled by moving a Day, not by changing how important it is.
            return dropped(item.path("dayRef").asString(""), "priority_from_load_only");
        }
        List<LocalDate> ownDates = new ArrayList<>();
        if (asked != null) {
            ownDates.add(asked);
        }
        if (day.plannedDate() != null) {
            ownDates.add(day.plannedDate());
        }
        if (reason.isEmpty() || !factual(reason, keys(evidence), false, context, allowedNumbers)
                || !weekdaysOk(reason, context, evidence, ownDates)) {
            log.info("ai.coach task={} kept ref={} cause=reason_replaced", PlanningCoachPrompt.TASK,
                    item.path("dayRef").asString(""));
            reason = CoachClaims.reasonFromEvidence(evidence, MAX_REASON);
        }
        PlanningDaySuggestion result = switch (type) {
            case OPEN_DAY -> new PlanningDaySuggestion(day.dayId(), day.title(), type, null, null, null, null, reason, evidence);
            case SET_DATE -> {
                LocalDate date = date(item.path("targetDate"));
                yield date != null && day.dateOptions().contains(date)
                        ? new PlanningDaySuggestion(day.dayId(), day.title(), type, date, null, null, null, reason, evidence)
                        : null;
            }
            case SET_PRIORITY -> {
                DayPriority priority = enumValue(DayPriority.class, item.path("priority"));
                if (priority == null || priority == day.priority()
                        || (priority == DayPriority.HIGH && highRaises[0] >= 1)) {
                    yield null;
                }
                if (priority == DayPriority.HIGH) {
                    highRaises[0]++;
                }
                yield new PlanningDaySuggestion(day.dayId(), day.title(), type, null, null, null, priority, reason, evidence);
            }
            case SET_SCHEDULE -> {
                LocalDate date = date(item.path("targetDate"));
                LocalTime start = time(item.path("startTime"));
                if (!day.scheduled() || date == null || start == null || !context.plannableDates().contains(date)) {
                    yield null;
                }
                // The Day's duration is kept and must end on the same date.
                long endMinute = start.getHour() * 60L + start.getMinute() + day.durationMinutes();
                boolean unchanged = date.equals(day.plannedDate()) && start.equals(day.start());
                if (endMinute >= 24 * 60 || unchanged) {
                    yield null;
                }
                yield new PlanningDaySuggestion(day.dayId(), day.title(), type, date, HH_MM.format(start),
                        HH_MM.format(start.plusMinutes(day.durationMinutes())), null, reason, evidence);
            }
        };
        return result != null ? result : dropped(item.path("dayRef").asString(""), "not_applicable");
    }

    private static boolean weekdaysOk(String text, PlanningCoachContext context, List<CoachFact> facts, List<LocalDate> dates) {
        return CoachClaims.weekdaysAllowed(CoachText.withoutTitles(text, context.titles()), CoachClaims.weekdays(facts, dates));
    }

    private static <T> T dropped(String ref, String cause) {
        log.info("ai.coach task={} dropped ref={} cause={}", PlanningCoachPrompt.TASK, ref, cause);
        return null;
    }

    private static PlanningDayProposal proposal(JsonNode item, PlanningCoachContext context, Set<String> allowedNumbers,
            int[] highRaises, Set<LocalDate> usedDates, Set<String> knownTitles) {
        String title = CoachText.clip(item.path("title").asString(""), MAX_TITLE);
        String reason = text(item.path("reason"), MAX_REASON, context);
        List<CoachFact> evidence = evidence(item.path("evidenceKeys"), context);
        DayPriority priority = enumValue(DayPriority.class, item.path("priority"));
        if (title.isEmpty() || reason.isEmpty() || evidence.isEmpty() || priority == null
                || !factual(reason, keys(evidence), false, context, allowedNumbers)
                || !weekdaysOk(reason, context, evidence, List.of())
                || CoachClaims.SUBJECTIVE_DIFFICULTY.matcher(title).find()) {
            return null;
        }
        // A new Day must come from a concrete TRY the user wrote, and its title must reuse that TRY's words.
        List<String> cited = evidence.stream().map(CoachFact::key).filter(context.tryLines()::containsKey)
                .map(context.tryLines()::get).toList();
        if (cited.isEmpty() || cited.stream().noneMatch(line -> sharesWord(title, line))) {
            return null;
        }
        if (!knownTitles.add(normalize(title))) {
            return null;
        }
        JsonNode dateNode = item.path("proposedDate");
        LocalDate date = null;
        if (!dateNode.isNull() && !dateNode.isMissingNode()) {
            date = date(dateNode);
            if (date == null || !context.plannableDates().contains(date) || !usedDates.add(date)) {
                return null;
            }
        }
        if (priority == DayPriority.HIGH) {
            if (highRaises[0] >= 1) {
                return null;
            }
            highRaises[0]++;
        }
        return new PlanningDayProposal(title, date, priority, reason, evidence);
    }

    static boolean sharesWord(String title, String line) {
        Matcher words = WORD.matcher(title);
        while (words.find()) {
            String word = words.group();
            if (word.matches("\\d+")) {
                continue;
            }
            // Korean particles attach to words ("일정은" / "일정을"): also compare without the last character.
            String stem = word.length() >= 3 ? word.substring(0, word.length() - 1) : word;
            if (line.contains(word) || line.contains(stem)) {
                return true;
            }
        }
        return false;
    }

    /** No guessed cause, difficulty or free time; computed numbers only; time-of-day claims need a date or recent fact. */
    static boolean factual(String text, Set<String> cited, boolean summaryLevel, PlanningCoachContext context,
            Set<String> allowedNumbers) {
        if (text.isEmpty()) {
            return true;
        }
        String own = CoachText.withoutTitles(text, context.titles());
        if (CoachClaims.UNSUPPORTED_CAUSE.matcher(own).find() || CoachClaims.SUBJECTIVE_DIFFICULTY.matcher(own).find()
                || CoachClaims.AVAILABILITY_GUESS.matcher(own).find() || !CoachClaims.numbersAllowed(own, allowedNumbers)) {
            return false;
        }
        if (summaryLevel || !CoachClaims.TIME_WORDS.matcher(own).find()) {
            return true;
        }
        return cited.stream().anyMatch(key -> key.startsWith("RECENT_TIME_") || key.startsWith("LOAD_")
                || key.startsWith("PREVIOUS_TRY_") || key.equals("RECENT_PATTERN_LIMITED"));
    }

    private static List<CoachFact> evidence(JsonNode keys, PlanningCoachContext context) {
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

    private static Set<String> keys(List<CoachFact> evidence) {
        Set<String> keys = new HashSet<>();
        evidence.forEach(fact -> keys.add(fact.key()));
        return keys;
    }

    private static <E extends Enum<E>> E enumValue(Class<E> type, JsonNode node) {
        try {
            return node.isString() ? Enum.valueOf(type, node.asString()) : null;
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

    private static LocalTime time(JsonNode node) {
        try {
            return node.isString() && node.asString().matches("\\d{2}:\\d{2}") ? LocalTime.parse(node.asString(), HH_MM) : null;
        } catch (DateTimeParseException invalid) {
            return null;
        }
    }

    static String normalize(String text) {
        return text == null ? "" : text.replaceAll("[\\s\\p{Punct}‘’“”·…]", "").toLowerCase();
    }

    private static String text(JsonNode node, int max, PlanningCoachContext context) {
        if (!node.isString()) {
            return "";
        }
        Map<String, String> refNames = new HashMap<>();
        context.days().forEach((ref, day) -> refNames.put(ref, day.title()));
        String clean = CoachText.clip(node.asString(), 1000);
        return CoachText.clip(CoachText.userFacing(clean,
                new CoachText.Vocabulary(refNames, context.evidence(), context.titles(), ENUM_WORDS)), max);
    }
}
