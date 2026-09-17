package com.dayflow.api.ai.today;

import static com.dayflow.api.ai.today.TodayCoachPrompt.MAX_EVIDENCE;
import static com.dayflow.api.ai.today.TodayCoachPrompt.MAX_HEADLINE;
import static com.dayflow.api.ai.today.TodayCoachPrompt.MAX_ITEMS;
import static com.dayflow.api.ai.today.TodayCoachPrompt.MAX_MESSAGE;
import static com.dayflow.api.ai.today.TodayCoachPrompt.MAX_REASON;
import static com.dayflow.api.ai.today.TodayCoachPrompt.MAX_SUMMARY;

import com.dayflow.api.ai.AiProviderException;
import com.dayflow.api.ai.CoachText;
import com.dayflow.api.ai.today.TodayCoachContext.BusyWindowFact;
import com.dayflow.api.ai.today.TodayCoachContext.DayFact;
import com.dayflow.api.ai.today.TodayCoachContext.GoalFact;
import com.dayflow.api.ai.today.TodayCoachDtos.CoachEvidence;
import com.dayflow.api.ai.today.TodayCoachDtos.CoachEvidenceType;
import com.dayflow.api.ai.today.TodayCoachDtos.CoachObservation;
import com.dayflow.api.ai.today.TodayCoachDtos.CoachPriority;
import com.dayflow.api.ai.today.TodayCoachDtos.CoachSuggestion;
import com.dayflow.api.ai.today.TodayCoachDtos.CoachSuggestionType;
import com.dayflow.api.ai.today.TodayCoachDtos.TodayCoachResponse;
import com.dayflow.api.day.DayPriority;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * Turns the untrusted model answer into a {@link TodayCoachResponse} (pure, no database, no provider).
 *
 * <p>The model is treated like any other client input. Anything that does not hold against the context is dropped
 * or fixed, never passed through: unknown refs (hallucinated or another user's ids never resolve), completed Days,
 * invalid or past dates, dates outside the Day's Goal period, unchanged or invalid priorities, unknown types, too many
 * items and too long text. Only a missing headline makes the whole answer unusable.
 *
 * <p>Quality rules enforced here as well, not only asked for in the prompt:
 * <ul>
 *   <li>user-facing text never shows internal refs (D1, G1, R1), metric keys or English enums</li>
 *   <li>no guessed difficulty ("가장 쉬운 일"): a priority reason is replaced by an objective one, other text dropped</li>
 *   <li>at most one "raise to 높음" suggestion (priority is importance; overload is solved by moving Days)</li>
 *   <li>recent unfinished Days and an overbooked schedule always get an observation built from computed data</li>
 * </ul>
 */
final class TodayCoachValidator {

    /** A reschedule further ahead than this is not a "today" suggestion. */
    static final int MAX_RESCHEDULE_DAYS_AHEAD = 30;

    static final Set<String> UNFINISHED_METRICS = Set.of("overdueCount", "yesterdayUnfinishedCount");
    static final Set<String> WORKLOAD_METRICS =
            Set.of("overbookedMinutes", "peakConcurrentCount", "totalScheduledMinutes", "scheduledDayCount");

    /** Subjective difficulty or effort guessed from a title; DayFlow has no data for it. */
    static final Pattern SUBJECTIVE_DIFFICULTY = Pattern.compile(
            "쉬운|쉬워|쉽게\\s*(시작|끝|할|해)|간단한\\s*(일|Day|작업|것)|가장\\s*간단|간단해\\s*보"
                    + "|부담(이|가)?\\s*(적|덜|없|작|크지)|금방\\s*(끝|할|해|마칠|마무리)"
                    + "|가볍게\\s*(시작|끝|할|해)|가벼운\\s*(일|Day|작업|것)|빨리\\s*끝낼\\s*수|손쉽");


    private TodayCoachValidator() {
    }

    static TodayCoachResponse validate(JsonNode output, TodayCoachContext context, Instant generatedAt) {
        if (output == null || !output.isObject()) {
            throw new AiProviderException(AiProviderException.Kind.INVALID_OUTPUT, "Answer is not a JSON object.");
        }
        String headline = text(output.path("headline"), MAX_HEADLINE, context);
        if (headline.isEmpty()) {
            throw new AiProviderException(AiProviderException.Kind.INVALID_OUTPUT, "Answer has no headline.");
        }
        if (guessesDifficulty(headline, context)) {
            headline = "오늘 계획을 데이터 기준으로 정리했어요";
        }
        String summary = text(output.path("summary"), MAX_SUMMARY, context);
        if (guessesDifficulty(summary, context)) {
            summary = "";
        }
        return new TodayCoachResponse(generatedAt, context.today(), headline, summary,
                priorities(output.path("priorities"), context), observations(output.path("observations"), context),
                suggestions(output.path("suggestions"), context));
    }

    static boolean guessesDifficulty(String text) {
        return SUBJECTIVE_DIFFICULTY.matcher(text).find();
    }

    /** Same check, ignoring the user's own titles ("쉬운 영어 읽기" is a title, not a judgement). */
    static boolean guessesDifficulty(String text, TodayCoachContext context) {
        return guessesDifficulty(CoachText.withoutTitles(text, titles(context)));
    }

    private static List<CoachPriority> priorities(JsonNode items, TodayCoachContext context) {
        List<CoachPriority> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode item : items) {
            if (result.size() == MAX_ITEMS) {
                break;
            }
            String ref = item.path("dayRef").asString("");
            DayFact day = context.days().get(ref);
            String reason = text(item.path("reason"), MAX_REASON, context);
            // Only today's unfinished Days, once each.
            if (day == null || !context.todayDayRefs().contains(ref) || day.finished() || reason.isEmpty()
                    || !seen.add(ref)) {
                continue;
            }
            if (guessesDifficulty(reason, context)) {
                reason = objectiveReason(day, context);
            }
            result.add(new CoachPriority(day.id(), day.title(), reason));
        }
        return result;
    }

    /** A reason built only from data: core, priority, Goal link and time placement. */
    static String objectiveReason(DayFact day, TodayCoachContext context) {
        List<String> parts = new ArrayList<>();
        if (day.core()) {
            parts.add("오늘의 핵심 Day");
        }
        if (day.priority() == DayPriority.HIGH) {
            parts.add("우선순위 높음");
        }
        GoalFact goal = day.goalRef() == null ? null : context.goals().get(day.goalRef());
        if (goal != null) {
            parts.add("'" + goal.title() + "' 목표와 연결");
        }
        if (day.startTime() != null) {
            parts.add(day.startTime() + " 일정");
        }
        String reason = parts.isEmpty()
                ? "난이도는 데이터로 판단하기 어려워요. 오늘 계획된 미완료 Day예요."
                : "난이도는 데이터로 판단하기 어려워요. " + String.join(", ", parts) + " 기준이에요.";
        return TodayCoachContextService.clip(reason, MAX_REASON);
    }

    private static List<CoachObservation> observations(JsonNode items, TodayCoachContext context) {
        List<CoachObservation> result = new ArrayList<>();
        for (JsonNode item : items) {
            if (result.size() == MAX_ITEMS) {
                break;
            }
            String message = text(item.path("message"), MAX_MESSAGE, context);
            List<CoachEvidence> evidence = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (JsonNode source : item.path("evidence")) {
                CoachEvidence resolved = evidence(source, context);
                if (evidence.size() < MAX_EVIDENCE && resolved != null && seen.add(resolved.type() + resolved.id())) {
                    evidence.add(resolved);
                }
            }
            // An observation without checkable evidence is an unsupported claim; a guessed difficulty too.
            if (!message.isEmpty() && !evidence.isEmpty() && !guessesDifficulty(message, context)) {
                result.add(new CoachObservation(message, evidence));
            }
        }

        // Signals the answer must not ignore: added from computed data when the model left them out.
        List<CoachObservation> required = new ArrayList<>();
        if (context.workload().overloaded() && result.stream().noneMatch(o -> citesWorkload(o, context))) {
            required.add(overloadObservation(context));
        }
        List<Entry<String, DayFact>> unfinished = context.unfinishedDays();
        if (!unfinished.isEmpty() && result.stream().noneMatch(o -> citesUnfinished(o, context))) {
            required.add(unfinishedObservation(unfinished.getFirst().getValue(), context));
        }
        while (!required.isEmpty() && result.size() + required.size() > MAX_ITEMS && !result.isEmpty()) {
            result.removeLast();
        }
        result.addAll(required);
        return result.size() > MAX_ITEMS ? new ArrayList<>(result.subList(0, MAX_ITEMS)) : result;
    }

    private static boolean citesWorkload(CoachObservation observation, TodayCoachContext context) {
        Set<String> windowKeys = new HashSet<>();
        context.workload().busyWindows().forEach(window -> windowKeys.add(window.key()));
        return observation.evidence().stream().anyMatch(evidence -> evidence.type() == CoachEvidenceType.METRIC
                && (WORKLOAD_METRICS.contains(evidence.id()) || windowKeys.contains(evidence.id())));
    }

    private static boolean citesUnfinished(CoachObservation observation, TodayCoachContext context) {
        Set<String> unfinishedIds = new HashSet<>();
        context.unfinishedDays().forEach(entry -> unfinishedIds.add(entry.getValue().id().toString()));
        return observation.evidence().stream().anyMatch(evidence ->
                (evidence.type() == CoachEvidenceType.METRIC && UNFINISHED_METRICS.contains(evidence.id()))
                        || (evidence.type() == CoachEvidenceType.DAY && unfinishedIds.contains(evidence.id())));
    }

    static CoachObservation overloadObservation(TodayCoachContext context) {
        BusyWindowFact window = context.workload().busyWindows().getFirst();
        String message = window.passed()
                ? "%s~%s에 Day %d개가 겹쳐 있었어요(가능 %s, 계획 %s). 남은 Day는 다시 배치하거나 정리해 보세요."
                : "%s~%s에 Day %d개가 겹쳐 있어요(가능 %s, 계획 %s). 이 시간 안에 모두 끝내기는 어려워요.";
        message = message.formatted(window.start(), window.end(), window.dayCount(),
                TodayCoachContextService.durationLabel(window.availableMinutes()),
                TodayCoachContextService.durationLabel(window.plannedMinutes()));
        List<CoachEvidence> evidence = new ArrayList<>();
        evidence.add(new CoachEvidence(CoachEvidenceType.METRIC, window.key(), context.metrics().get(window.key()).label()));
        if (context.metrics().containsKey("overbookedMinutes")) {
            evidence.add(new CoachEvidence(CoachEvidenceType.METRIC, "overbookedMinutes",
                    context.metrics().get("overbookedMinutes").label()));
        }
        return new CoachObservation(TodayCoachContextService.clip(message, MAX_MESSAGE), evidence);
    }

    static CoachObservation unfinishedObservation(DayFact latest, TodayCoachContext context) {
        boolean yesterday = latest.plannedDate().equals(context.today().minusDays(1));
        String when = yesterday ? "어제" : latest.plannedDate().getMonthValue() + "월 " + latest.plannedDate().getDayOfMonth() + "일에";
        String message = when + " 끝내지 못한 '" + latest.title()
                + "' Day가 남아 있어요. 오늘 계획과 비교해 다시 배치할지, Recovery에서 정리할지 정해 보세요.";
        List<CoachEvidence> evidence = new ArrayList<>();
        evidence.add(new CoachEvidence(CoachEvidenceType.DAY, latest.id().toString(), latest.title()));
        String metricKey = yesterday && context.metrics().containsKey("yesterdayUnfinishedCount")
                ? "yesterdayUnfinishedCount" : "overdueCount";
        if (context.metrics().containsKey(metricKey)) {
            evidence.add(new CoachEvidence(CoachEvidenceType.METRIC, metricKey, context.metrics().get(metricKey).label()));
        }
        return new CoachObservation(TodayCoachContextService.clip(message, MAX_MESSAGE), evidence);
    }

    private static CoachEvidence evidence(JsonNode source, TodayCoachContext context) {
        String ref = source.path("ref").asString("");
        return switch (source.path("type").asString("")) {
            case "DAY" -> {
                DayFact day = context.days().get(ref);
                yield day == null ? null : new CoachEvidence(CoachEvidenceType.DAY, day.id().toString(), day.title());
            }
            case "GOAL" -> {
                GoalFact goal = context.goals().get(ref);
                yield goal == null ? null : new CoachEvidence(CoachEvidenceType.GOAL, goal.id().toString(), goal.title());
            }
            case "REVIEW" -> {
                TodayCoachContext.ReviewFact review = context.reviews().get(ref);
                yield review == null ? null
                        : new CoachEvidence(CoachEvidenceType.REVIEW, review.id().toString(), review.label());
            }
            case "METRIC" -> {
                TodayCoachContext.MetricFact metric = context.metrics().get(ref);
                yield metric == null ? null : new CoachEvidence(CoachEvidenceType.METRIC, ref, metric.label());
            }
            default -> null;
        };
    }

    private static List<CoachSuggestion> suggestions(JsonNode items, TodayCoachContext context) {
        List<CoachSuggestion> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        boolean raisedToHigh = false;
        for (JsonNode item : items) {
            if (result.size() == MAX_ITEMS) {
                break;
            }
            CoachSuggestion suggestion = suggestion(item, context);
            if (suggestion == null) {
                continue;
            }
            // Priority inflation: only one "raise to 높음" per answer.
            if (suggestion.type() == CoachSuggestionType.SET_PRIORITY && suggestion.proposedPriority() == DayPriority.HIGH) {
                if (raisedToHigh) {
                    continue;
                }
                raisedToHigh = true;
            }
            // One suggestion per (type, Day); advice is deduplicated by its text.
            String key = suggestion.type() + ":" + (suggestion.dayId() == null ? suggestion.message() : suggestion.dayId());
            if (seen.add(key)) {
                result.add(suggestion);
            }
        }
        return result;
    }

    private static CoachSuggestion suggestion(JsonNode item, TodayCoachContext context) {
        String message = text(item.path("message"), MAX_MESSAGE, context);
        CoachSuggestionType type = enumValue(CoachSuggestionType.class, item.path("type"));
        if (message.isEmpty() || type == null || guessesDifficulty(message, context)) {
            return null;
        }
        if (type == CoachSuggestionType.ADVICE_ONLY) {
            return new CoachSuggestion(type, null, null, message, null, null);
        }
        DayFact day = context.days().get(item.path("dayRef").asString(""));
        if (day == null || day.finished()) {
            return null;
        }
        return switch (type) {
            case OPEN_DAY -> new CoachSuggestion(type, day.id(), day.title(), message, null, null);
            case RESCHEDULE_DAY -> {
                LocalDate date = date(item.path("proposedDate"));
                GoalFact goal = day.goalRef() == null ? null : context.goals().get(day.goalRef());
                boolean valid = date != null
                        && !date.isBefore(context.today())
                        && !date.isAfter(context.today().plusDays(MAX_RESCHEDULE_DAYS_AHEAD))
                        && !date.equals(day.plannedDate())
                        // A Goal-linked Day must stay in its Goal period (the Day API would refuse it anyway).
                        && (day.goalRef() == null || (goal != null && goal.contains(date)));
                yield valid ? new CoachSuggestion(type, day.id(), day.title(), message, date, null) : null;
            }
            case SET_PRIORITY -> {
                DayPriority priority = enumValue(DayPriority.class, item.path("proposedPriority"));
                yield priority == null || priority == day.priority() ? null
                        : new CoachSuggestion(type, day.id(), day.title(), message, null, priority);
            }
            case ADVICE_ONLY -> null;
        };
    }

    private static LocalDate date(JsonNode node) {
        if (!node.isString()) {
            return null;
        }
        try {
            return LocalDate.parse(node.asString());
        } catch (DateTimeParseException invalid) {
            return null;
        }
    }

    private static <E extends Enum<E>> E enumValue(Class<E> type, JsonNode node) {
        if (!node.isString()) {
            return null;
        }
        try {
            return Enum.valueOf(type, node.asString());
        } catch (IllegalArgumentException unknown) {
            return null;
        }
    }

    private static String text(JsonNode node, int max, TodayCoachContext context) {
        if (!node.isString()) {
            return "";
        }
        // Clean before clipping so a replaced title cannot push a ref out of view; clip again after replacing.
        String clean = TodayCoachContextService.clip(node.asString(), 1000);
        return TodayCoachContextService.clip(userFacing(clean, context), max);
    }

    /**
     * Replaces internal refs of the current context (D1, G1, R1), metric keys and English enums with what the user
     * knows (titles, labels, Korean words). Shared rules: {@link CoachText}.
     */
    static String userFacing(String text, TodayCoachContext context) {
        return CoachText.userFacing(text, vocabulary(context));
    }

    private static CoachText.Vocabulary vocabulary(TodayCoachContext context) {
        Map<String, String> refNames = new HashMap<>();
        context.days().forEach((ref, day) -> refNames.put(ref, day.title()));
        context.goals().forEach((ref, goal) -> refNames.put(ref, goal.title()));
        context.reviews().forEach((ref, review) -> refNames.put(ref, review.label()));
        Map<String, String> keyLabels = new HashMap<>();
        context.metrics().forEach((key, metric) -> keyLabels.put(key, metric.label()));
        return new CoachText.Vocabulary(refNames, keyLabels, titles(context), CoachText.PLANNING_ENUM_WORDS);
    }

    private static List<String> titles(TodayCoachContext context) {
        List<String> titles = new ArrayList<>();
        context.days().values().forEach(day -> titles.add(day.title()));
        context.goals().values().forEach(goal -> titles.add(goal.title()));
        return titles;
    }
}
