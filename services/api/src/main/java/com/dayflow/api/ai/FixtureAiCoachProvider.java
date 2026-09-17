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
