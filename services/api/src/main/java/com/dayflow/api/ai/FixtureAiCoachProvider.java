package com.dayflow.api.ai;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Deterministic answers built from the context itself, without any network call. Used by the test profile and for
 * local UI work ({@code AI_COACH_PROVIDER=fixture}); {@link AiProductionConfigValidator} refuses it in prod.
 *
 * <p>The answer still goes through the Coach's normal validation, like a real model answer.
 */
public class FixtureAiCoachProvider implements AiCoachProvider {

    private final JsonMapper jsonMapper;

    public FixtureAiCoachProvider(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    @Override
    public String name() {
        return "fixture";
    }

    @Override
    public boolean available() {
        return true;
    }

    @Override
    public AiStructuredResult generate(AiStructuredRequest request) {
        JsonNode data = jsonMapper.readTree(request.dataJson());
        Map<String, Object> answer = switch (request.task()) {
            case "today-coach" -> todayCoach(data);
            case "review-coach" -> reviewCoach(data);
            case "recovery-coach" -> recoveryCoach(data);
            case "planning-coach" -> planningCoach(data);
            default -> throw new AiProviderException(AiProviderException.Kind.INVALID_OUTPUT, "No fixture for this task.");
        };
        return new AiStructuredResult(jsonMapper.valueToTree(answer), "fixture", null, null);
    }

    /**
     * A KPT draft that only cites evidence keys present in the context. Evidence keys written into text are turned
     * into their labels by the Review Coach validator, so the fixture never invents a number.
     */
    private static Map<String, Object> reviewCoach(JsonNode data) {
        Set<String> keys = new LinkedHashSet<>();
        data.path("evidence").forEach(item -> keys.add(item.path("key").asString()));
        boolean noDays = keys.contains("NO_DAYS");

        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("headline", noDays ? "이번 기간에는 기록이 거의 없어요" : "이번 기간 기록을 바탕으로 정리했어요");
        answer.put("summary", noDays ? "근거: NO_DAYS" : "근거: COMPLETION");

        List<Map<String, Object>> highlights = new ArrayList<>();
        keys.stream().filter(key -> !key.startsWith("PREVIOUS_")).limit(2)
                .forEach(key -> highlights.add(Map.of("message", key, "evidenceKeys", List.of(key))));
        answer.put("highlights", highlights);

        List<Map<String, Object>> keep = new ArrayList<>();
        String keepKey = keys.contains("CORE_COMPLETION") ? "CORE_COMPLETION" : keys.contains("COMPLETION") ? "COMPLETION" : null;
        if (keepKey != null) {
            keep.add(draft("핵심 Day를 먼저 정해두는 흐름은 유지해 보기", "근거: " + keepKey, keepKey));
        }
        answer.put("keep", keep);

        List<Map<String, Object>> problem = new ArrayList<>();
        if (keys.contains("OVERBOOKED")) {
            problem.add(draft("같은 시간에 Day가 겹쳐 배치된 날이 있었어요", "근거: OVERBOOKED", "OVERBOOKED"));
        }
        if (keys.contains("UNFINISHED")) {
            problem.add(draft("미완료로 남은 Day가 다음 계획까지 이어졌어요", "근거: UNFINISHED", "UNFINISHED"));
        }
        answer.put("problem", problem);

        List<Map<String, Object>> tries = new ArrayList<>();
        if (keys.contains("OVERBOOKED")) {
            tries.add(draft("다음 기간에는 같은 시간대에 Day를 1개만 배치하기", "근거: OVERBOOKED", "OVERBOOKED"));
        } else if (keys.contains("UNFINISHED")) {
            tries.add(draft("다음 기간 중간에 미완료 Day를 Recovery에서 한 번 정리하기", "근거: UNFINISHED", "UNFINISHED"));
        } else if (keepKey != null) {
            tries.add(draft("다음 기간에도 첫날 핵심 Day를 먼저 정하기", "근거: " + keepKey, keepKey));
        }
        answer.put("try", tries);
        return answer;
    }

    /**
     * One recommendation per candidate, only among the options DayFlow offered: DROP where supported, else MOVE to the
     * first offered date, else CARRY_OVER to the first offered date, else KEEP. Reasons are evidence keys, which the
     * validator turns into labels.
     */
    private static Map<String, Object> recoveryCoach(JsonNode data) {
        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("headline", "남은 Day를 하나씩 정리해 봤어요");
        answer.put("summary", "근거: CANDIDATES");
        answer.put("observations", List.of(Map.of("message", "CANDIDATES", "evidenceKeys", List.of("CANDIDATES"))));
        List<Map<String, Object>> recommendations = new ArrayList<>();
        data.path("candidates").forEach(candidate -> {
            String ref = candidate.path("ref").asString();
            Set<String> allowed = new LinkedHashSet<>();
            candidate.path("allowedActions").forEach(action -> allowed.add(action.asString()));
            String action;
            String date = null;
            if (candidate.path("dropSupported").asBoolean() && allowed.contains("DROP")) {
                action = "DROP";
            } else if (allowed.contains("MOVE") && candidate.path("moveDates").size() > 0) {
                action = "MOVE";
                date = candidate.path("moveDates").path(0).asString();
            } else if (allowed.contains("CARRY_OVER") && candidate.path("carryOverDates").size() > 0) {
                action = "CARRY_OVER";
                date = candidate.path("carryOverDates").path(0).asString();
            } else {
                action = "KEEP";
            }
            List<String> keys = new ArrayList<>();
            keys.add("OVERDUE_" + ref);
            if (date != null) {
                keys.add("LOAD_" + date.replace("-", "_"));
            }
            Map<String, Object> recommendation = new LinkedHashMap<>();
            recommendation.put("dayRef", ref);
            recommendation.put("action", action);
            recommendation.put("targetDate", date);
            recommendation.put("reason", "근거: OVERDUE_" + ref);
            recommendation.put("evidenceKeys", keys);
            recommendations.add(recommendation);
        });
        answer.put("recommendations", recommendations);
        return answer;
    }

    /**
     * Existing-Day suggestions only (no new Day): SET_DATE for the first unscheduled open Day to the first offered
     * date. Mirrors the Planning Coach rules without inventing anything.
     */
    private static Map<String, Object> planningCoach(JsonNode data) {
        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("headline", "다음 기간 계획을 점검해 봤어요");
        answer.put("summary", "근거: PLANNED_DAYS");
        answer.put("observations", List.of(Map.of("message", "PLANNED_DAYS", "evidenceKeys", List.of("PLANNED_DAYS"))));
        List<Map<String, Object>> suggestions = new ArrayList<>();
        for (JsonNode day : data.path("days")) {
            if (day.path("dateOptions").size() > 0 && !day.path("finished").asBoolean()) {
                Map<String, Object> suggestion = new LinkedHashMap<>();
                suggestion.put("dayRef", day.path("ref").asString());
                suggestion.put("type", "SET_DATE");
                suggestion.put("targetDate", day.path("dateOptions").path(0).asString());
                suggestion.put("startTime", null);
                suggestion.put("priority", null);
                suggestion.put("reason", "근거: PLANNED_DAYS");
                suggestion.put("evidenceKeys", List.of("PLANNED_DAYS"));
                suggestions.add(suggestion);
                break;
            }
        }
        answer.put("existingDaySuggestions", suggestions);
        answer.put("newDayProposals", List.of());
        return answer;
    }

    private static Map<String, Object> draft(String text, String reason, String key) {
        Map<String, Object> draft = new LinkedHashMap<>();
        draft.put("text", text);
        draft.put("reason", reason);
        draft.put("evidenceKeys", List.of(key));
        return draft;
    }

    private static Map<String, Object> todayCoach(JsonNode data) {
        List<JsonNode> openToday = new ArrayList<>();
        data.path("todayDays").forEach(day -> {
            if (!day.path("completed").asBoolean()) {
                openToday.add(day);
            }
        });
        JsonNode firstUnfinished = data.path("unfinishedDays").path(0);

        Map<String, Object> answer = new LinkedHashMap<>();
        answer.put("headline", openToday.isEmpty() ? "오늘 남은 Day가 없어요" : "오늘은 " + openToday.size() + "개의 Day가 남아 있어요");
        answer.put("summary", openToday.isEmpty()
                ? "오늘 계획된 미완료 Day가 없어서 우선순위를 제안할 데이터가 부족해요."
                : "먼저 핵심 Day부터 끝내고, 남은 시간에 나머지를 정리해 보세요.");

        List<Map<String, Object>> priorities = new ArrayList<>();
        for (JsonNode day : openToday.subList(0, Math.min(2, openToday.size()))) {
            priorities.add(Map.of("dayRef", day.path("ref").asString(), "reason", "오늘 계획된 미완료 Day예요."));
        }
        answer.put("priorities", priorities);

        answer.put("observations", List.of(Map.of(
                "message", "오늘 남은 Day 수를 기준으로 정리했어요.",
                "evidence", List.of(Map.of("type", "METRIC", "ref", "todayOpenCount")))));

        List<Map<String, Object>> suggestions = new ArrayList<>();
        if (!firstUnfinished.isMissingNode()) {
            suggestions.add(suggestion("RESCHEDULE_DAY", firstUnfinished.path("ref").asString(),
                    "지난 미완료 Day를 오늘로 옮겨 다시 시작해 보세요.", data.path("today").asString(), null));
        }
        openToday.stream().filter(day -> !"HIGH".equals(day.path("priority").asString())).findFirst()
                .ifPresent(day -> suggestions.add(suggestion("SET_PRIORITY", day.path("ref").asString(),
                        "이 Day의 우선순위를 높여 먼저 챙겨 보세요.", null, "HIGH")));
        suggestions.add(suggestion("ADVICE_ONLY", null, "한 번에 하나의 Day에만 집중해 보세요.", null, null));
        answer.put("suggestions", suggestions);
        return answer;
    }

    private static Map<String, Object> suggestion(String type, String dayRef, String message, String proposedDate,
            String proposedPriority) {
        Map<String, Object> suggestion = new LinkedHashMap<>();
        suggestion.put("type", type);
        suggestion.put("dayRef", dayRef);
        suggestion.put("message", message);
        suggestion.put("proposedDate", proposedDate);
        suggestion.put("proposedPriority", proposedPriority);
        return suggestion;
    }
}
