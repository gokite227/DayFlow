package com.dayflow.api.ai.today;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dayflow.api.ai.AiProviderException;
import com.dayflow.api.ai.today.TodayCoachContext.DayFact;
import com.dayflow.api.ai.today.TodayCoachContext.GoalFact;
import com.dayflow.api.ai.today.TodayCoachContext.MetricFact;
import com.dayflow.api.ai.today.TodayCoachContext.ReviewFact;
import com.dayflow.api.ai.today.TodayCoachDtos.CoachEvidenceType;
import com.dayflow.api.ai.today.TodayCoachDtos.CoachSuggestionType;
import com.dayflow.api.ai.today.TodayCoachDtos.TodayCoachResponse;
import com.dayflow.api.day.DayPriority;
import com.dayflow.api.day.DayStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Hallucination and limit checks of the Today Coach answer (pure, no Spring). */
class TodayCoachValidatorTest {

    private static final LocalDate TODAY = LocalDate.of(2031, 3, 5);
    private static final UUID OPEN_TODAY = UUID.randomUUID();
    private static final UUID OPEN_TODAY_2 = UUID.randomUUID();
    private static final UUID DONE_TODAY = UUID.randomUUID();
    private static final UUID OVERDUE = UUID.randomUUID();
    private static final UUID GOAL_LINKED = UUID.randomUUID();
    private static final UUID GOAL = UUID.randomUUID();
    private static final UUID REVIEW = UUID.randomUUID();

    private static final TodayCoachContext.WorkloadFact OVERLOADED = new TodayCoachContext.WorkloadFact(60,
            List.of(new TodayCoachContext.BusyWindowFact("busyWindow1", "20:00", "21:00", 2, 60, 120, false)));

    private static final TodayCoachContext CONTEXT = context(TodayCoachContext.WorkloadFact.NONE);

    /** Refs in context order: today's Days, then unfinished Days newest first (like TodayCoachContextService). */
    private static TodayCoachContext context(TodayCoachContext.WorkloadFact workload) {
        Map<String, DayFact> days = new LinkedHashMap<>();
        days.put("D1", new DayFact(OPEN_TODAY, "보고서 초안", DayStatus.NOT_STARTED, DayPriority.MEDIUM, TODAY, null, true,
                "20:00"));
        days.put("D2", new DayFact(DONE_TODAY, "운동", DayStatus.DONE, DayPriority.LOW, TODAY, null, false, null));
        days.put("D5", new DayFact(OPEN_TODAY_2, "HIGH school 숙제", DayStatus.NOT_STARTED, DayPriority.LOW, TODAY, null,
                false, "20:00"));
        days.put("D4", new DayFact(GOAL_LINKED, "주간 목표 작업", DayStatus.IN_PROGRESS, DayPriority.HIGH,
                TODAY.minusDays(1), "G1", false, null));
        days.put("D3", new DayFact(OVERDUE, "메일 정리", DayStatus.DEFERRED, DayPriority.NONE, TODAY.minusDays(2), null,
                false, null));
        Map<String, MetricFact> metrics = new LinkedHashMap<>();
        metrics.put("todayOpenCount", new MetricFact("오늘 남은 Day 1개"));
        metrics.put("overdueCount", new MetricFact("최근 14일 미완료 Day 2개"));
        metrics.put("yesterdayUnfinishedCount", new MetricFact("어제 끝내지 못한 Day 1개"));
        metrics.put("overbookedMinutes", new MetricFact("겹쳐서 넘치는 시간 1시간"));
        workload.busyWindows().forEach(window ->
                metrics.put(window.key(), new MetricFact(window.start() + "~" + window.end())));
        return new TodayCoachContext(TODAY, Map.of(), days, Set.of("D1", "D2", "D5"),
                Map.of("G1", new GoalFact(GOAL, "3월 1주", LocalDate.of(2031, 3, 3), LocalDate.of(2031, 3, 7))),
                Map.of("R1", new ReviewFact(REVIEW, "주간 회고 2031-02-24")), metrics, workload);
    }

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    private TodayCoachResponse validate(String json) {
        return validate(json, CONTEXT);
    }

    private TodayCoachResponse validate(String json, TodayCoachContext context) {
        JsonNode node = jsonMapper.readTree(json);
        return TodayCoachValidator.validate(node, context, Instant.parse("2031-03-05T01:00:00Z"));
    }

    private static String answer(String priorities, String observations, String suggestions) {
        return """
                {"headline":"오늘의 핵심","summary":"요약","priorities":%s,"observations":%s,"suggestions":%s}
                """.formatted(priorities, observations, suggestions);
    }

    @Test
    void validAnswerResolvesRefsToTheUsersIds() {
        TodayCoachResponse response = validate(answer(
                "[{\"dayRef\":\"D1\",\"reason\":\"마감이 가까워요\"}]",
                "[{\"message\":\"남은 Day가 1개예요\",\"evidence\":[{\"type\":\"METRIC\",\"ref\":\"todayOpenCount\"},"
                        + "{\"type\":\"GOAL\",\"ref\":\"G1\"},{\"type\":\"REVIEW\",\"ref\":\"R1\"}]}]",
                "[{\"type\":\"OPEN_DAY\",\"dayRef\":\"D3\",\"message\":\"확인해 보세요\",\"proposedDate\":null,\"proposedPriority\":null}]"));

        assertThat(response.localDate()).isEqualTo(TODAY);
        assertThat(response.priorities()).singleElement().satisfies(priority -> {
            assertThat(priority.dayId()).isEqualTo(OPEN_TODAY);
            assertThat(priority.dayTitle()).isEqualTo("보고서 초안");
        });
        assertThat(response.observations().getFirst().evidence()).extracting(evidence -> evidence.id())
                .containsExactly("todayOpenCount", GOAL.toString(), REVIEW.toString());
        assertThat(response.suggestions()).singleElement().satisfies(suggestion -> {
            assertThat(suggestion.type()).isEqualTo(CoachSuggestionType.OPEN_DAY);
            assertThat(suggestion.dayId()).isEqualTo(OVERDUE);
        });
    }

    @Test
    void unknownAndForeignIdsAreDropped() {
        String foreignUuid = UUID.randomUUID().toString();
        TodayCoachResponse response = validate(answer(
                "[{\"dayRef\":\"D99\",\"reason\":\"x\"},{\"dayRef\":\"" + foreignUuid + "\",\"reason\":\"x\"}]",
                "[{\"message\":\"근거 없음\",\"evidence\":[{\"type\":\"DAY\",\"ref\":\"" + foreignUuid + "\"},"
                        + "{\"type\":\"METRIC\",\"ref\":\"madeUpMetric\"}]}]",
                "[{\"type\":\"OPEN_DAY\",\"dayRef\":\"" + foreignUuid + "\",\"message\":\"m\",\"proposedDate\":null,\"proposedPriority\":null}]"));

        assertThat(response.priorities()).isEmpty();
        // Only the observation DayFlow adds for the unfinished Days; nothing of the model survives.
        assertThat(response.observations()).singleElement()
                .satisfies(observation -> assertThat(observation.message()).contains("끝내지 못한"));
        assertThat(response.suggestions()).isEmpty();
    }

    @Test
    void completedDaysAreNeverRecommended() {
        TodayCoachResponse response = validate(answer(
                "[{\"dayRef\":\"D2\",\"reason\":\"다시\"}]",
                "[]",
                "[{\"type\":\"OPEN_DAY\",\"dayRef\":\"D2\",\"message\":\"m\",\"proposedDate\":null,\"proposedPriority\":null},"
                        + "{\"type\":\"SET_PRIORITY\",\"dayRef\":\"D2\",\"message\":\"m\",\"proposedDate\":null,\"proposedPriority\":\"HIGH\"}]"));

        assertThat(response.priorities()).isEmpty();
        assertThat(response.suggestions()).isEmpty();
    }

    @Test
    void prioritiesOnlyComeFromTodaysDays() {
        TodayCoachResponse response = validate(answer("[{\"dayRef\":\"D3\",\"reason\":\"지난 Day\"}]", "[]", "[]"));
        assertThat(response.priorities()).isEmpty();
    }

    @Test
    void rescheduleDatesAreChecked() {
        String template = "{\"type\":\"RESCHEDULE_DAY\",\"dayRef\":\"%s\",\"message\":\"%s\",\"proposedDate\":%s,\"proposedPriority\":null}";
        TodayCoachResponse response = validate(answer("[]", "[]", "["
                + template.formatted("D3", "past", "\"2031-03-04\"") + ","
                + template.formatted("D3", "bad", "\"2031-02-30\"") + ","
                + template.formatted("D3", "missing", "null") + ","
                + template.formatted("D3", "far", "\"2031-06-01\"") + ","
                + template.formatted("D4", "outside goal", "\"2031-03-10\"") + ","
                + template.formatted("D1", "same date", "\"2031-03-05\"") + ","
                + template.formatted("D4", "ok in goal", "\"2031-03-06\"") + "]"));

        assertThat(response.suggestions()).singleElement().satisfies(suggestion -> {
            assertThat(suggestion.message()).isEqualTo("ok in goal");
            assertThat(suggestion.dayId()).isEqualTo(GOAL_LINKED);
            assertThat(suggestion.proposedDate()).isEqualTo(LocalDate.of(2031, 3, 6));
        });
    }

    @Test
    void priorityChangesMustBeValidAndDifferent() {
        String template = "{\"type\":\"SET_PRIORITY\",\"dayRef\":\"%s\",\"message\":\"%s\",\"proposedDate\":null,\"proposedPriority\":%s}";
        TodayCoachResponse response = validate(answer("[]", "[]", "["
                + template.formatted("D1", "invalid", "\"URGENT\"") + ","
                + template.formatted("D1", "same", "\"MEDIUM\"") + ","
                + template.formatted("D1", "null", "null") + ","
                + template.formatted("D1", "ok", "\"HIGH\"") + "]"));

        assertThat(response.suggestions()).singleElement().satisfies(suggestion -> {
            assertThat(suggestion.message()).isEqualTo("ok");
            assertThat(suggestion.proposedPriority()).isEqualTo(DayPriority.HIGH);
        });
    }

    @Test
    void unknownTypesAreDroppedAndAdviceCarriesNoAction() {
        TodayCoachResponse response = validate(answer("[]", "[]", "["
                + "{\"type\":\"DELETE_DAY\",\"dayRef\":\"D1\",\"message\":\"삭제\",\"proposedDate\":null,\"proposedPriority\":null},"
                + "{\"type\":\"ADVICE_ONLY\",\"dayRef\":\"D1\",\"message\":\"쉬어가요\",\"proposedDate\":\"2031-03-06\",\"proposedPriority\":\"HIGH\"}]"));

        assertThat(response.suggestions()).singleElement().satisfies(suggestion -> {
            assertThat(suggestion.type()).isEqualTo(CoachSuggestionType.ADVICE_ONLY);
            assertThat(suggestion.dayId()).isNull();
            assertThat(suggestion.proposedDate()).isNull();
            assertThat(suggestion.proposedPriority()).isNull();
        });
    }

    @Test
    void countsAndLengthsAreLimited() {
        String longText = "가".repeat(500);
        StringBuilder advice = new StringBuilder("[");
        for (int i = 0; i < 6; i++) {
            advice.append(i == 0 ? "" : ",").append("{\"type\":\"ADVICE_ONLY\",\"dayRef\":null,\"message\":\"조언 ")
                    .append(i).append("\",\"proposedDate\":null,\"proposedPriority\":null}");
        }
        advice.append("]");
        String json = """
                {"headline":"%s","summary":"%s","priorities":[],"observations":[
                  {"message":"%s","evidence":[{"type":"METRIC","ref":"todayOpenCount"}]},
                  {"message":"b","evidence":[{"type":"METRIC","ref":"todayOpenCount"}]},
                  {"message":"c","evidence":[{"type":"METRIC","ref":"todayOpenCount"}]},
                  {"message":"d","evidence":[{"type":"METRIC","ref":"todayOpenCount"}]}],
                 "suggestions":%s}
                """.formatted(longText, longText, longText, advice);

        TodayCoachResponse response = validate(json);

        assertThat(response.headline()).hasSize(TodayCoachPrompt.MAX_HEADLINE);
        assertThat(response.summary()).hasSize(TodayCoachPrompt.MAX_SUMMARY);
        assertThat(response.observations()).hasSize(3);
        assertThat(response.observations().getFirst().message()).hasSize(TodayCoachPrompt.MAX_MESSAGE);
        assertThat(response.suggestions()).hasSize(3);
    }

    @Test
    void duplicatePrioritiesAreRemoved() {
        TodayCoachResponse response = validate(answer(
                "[{\"dayRef\":\"D1\",\"reason\":\"a\"},{\"dayRef\":\"D1\",\"reason\":\"b\"}]", "[]", "[]"));
        assertThat(response.priorities()).hasSize(1);
    }

    @Test
    void missingHeadlineOrWrongShapeIsUnusable() {
        assertThatThrownBy(() -> validate("{\"headline\":\"  \",\"summary\":\"x\"}"))
                .isInstanceOf(AiProviderException.class);
        assertThatThrownBy(() -> validate("[]")).isInstanceOf(AiProviderException.class);
        // Wrong field types are tolerated field by field instead of failing the whole answer.
        TodayCoachResponse response = validate("{\"headline\":\"ok\",\"summary\":7,\"priorities\":\"D1\"}");
        assertThat(response.summary()).isEmpty();
        assertThat(response.priorities()).isEmpty();
    }

    @Test
    void internalRefsNeverReachUserText() {
        TodayCoachResponse response = validate("""
                {"headline":"D1부터 시작해요","summary":"'D4'는 G1 기간 안이고 R1에도 적었어요. 보고서 초안(D1)도 봐요.",
                 "priorities":[{"dayRef":"D1","reason":"D1은 G1과 무관해요"}],
                 "observations":[{"message":"D3가 밀렸어요","evidence":[{"type":"DAY","ref":"D3"}]}],
                 "suggestions":[{"type":"OPEN_DAY","dayRef":"D4","message":"D4를 열어 보세요","proposedDate":null,"proposedPriority":null}]}
                """);

        assertThat(response.headline()).isEqualTo("'보고서 초안'부터 시작해요");
        assertThat(response.summary())
                .isEqualTo("'주간 목표 작업'는 '3월 1주' 기간 안이고 '주간 회고 2031-02-24'에도 적었어요. 보고서 초안도 봐요.");
        assertThat(response.priorities().getFirst().reason()).isEqualTo("'보고서 초안'은 '3월 1주'과 무관해요");
        assertThat(response.observations().getFirst().message()).isEqualTo("'메일 정리'가 밀렸어요");
        assertThat(response.suggestions().getFirst().message()).isEqualTo("'주간 목표 작업'를 열어 보세요");
        String all = response.headline() + response.summary() + response.priorities() + response.observations()
                + response.suggestions().stream().map(s -> s.message()).toList();
        assertThat(all).doesNotContainPattern("(?<![A-Za-z0-9])[DGR][0-9]+(?![A-Za-z0-9])");
    }

    @Test
    void onlyKnownRefsAreReplacedSoOrdinaryTextStays() {
        assertThat(TodayCoachValidator.userFacing("DDR4 램, D99 구역, G7 정상회의, AD1 코드", CONTEXT))
                .isEqualTo("DDR4 램, D99 구역, G7 정상회의, AD1 코드");
    }

    @Test
    void englishEnumsAndMetricKeysBecomeKoreanButTitlesStay() {
        TodayCoachResponse response = validate(answer("[]", "[]", """
                [{"type":"SET_PRIORITY","dayRef":"D1","message":"우선순위를 HIGH로 설정하고 overbookedMinutes를 줄여요",
                  "proposedDate":null,"proposedPriority":"HIGH"},
                 {"type":"OPEN_DAY","dayRef":"D5","message":"D5는 지금 LOW예요","proposedDate":null,"proposedPriority":null}]
                """));

        assertThat(response.suggestions().get(0).message())
                .isEqualTo("우선순위를 높음으로 설정하고 겹쳐서 넘치는 시간 1시간를 줄여요");
        // "HIGH school 숙제" is a title: its words are not rewritten.
        assertThat(response.suggestions().get(1).message()).isEqualTo("'HIGH school 숙제'는 지금 낮음예요");
        assertThat(response.suggestions().get(0).proposedPriority()).isEqualTo(DayPriority.HIGH);
    }

    @Test
    void subjectiveDifficultyIsNotShown() {
        TodayCoachResponse response = validate("""
                {"headline":"가장 쉬운 일부터 해요","summary":"공부하기는 금방 끝낼 수 있어요.",
                 "priorities":[{"dayRef":"D1","reason":"가장 쉽게 시작할 수 있는 일이에요"}],
                 "observations":[{"message":"부담이 적은 Day가 많아요","evidence":[{"type":"METRIC","ref":"todayOpenCount"}]}],
                 "suggestions":[{"type":"ADVICE_ONLY","dayRef":null,"message":"간단한 일부터 끝내세요","proposedDate":null,"proposedPriority":null},
                                {"type":"ADVICE_ONLY","dayRef":null,"message":"핵심 Day를 먼저 해요","proposedDate":null,"proposedPriority":null}]}
                """);

        assertThat(response.headline()).isEqualTo("오늘 계획을 데이터 기준으로 정리했어요");
        assertThat(response.summary()).isEmpty();
        assertThat(response.priorities().getFirst().reason())
                .startsWith("난이도는 데이터로 판단하기 어려워요.")
                .contains("오늘의 핵심 Day").contains("20:00 일정");
        assertThat(response.observations()).noneSatisfy(o -> assertThat(o.message()).contains("부담"));
        assertThat(response.suggestions()).extracting(s -> s.message()).containsExactly("핵심 Day를 먼저 해요");
        assertThat(TodayCoachValidator.guessesDifficulty("현재 데이터만으로는 난이도를 판단하기 어려워요")).isFalse();
        assertThat(TodayCoachValidator.guessesDifficulty("'공부하기'는 오늘의 핵심 Day예요")).isFalse();
        // A user's own title is not a judgement.
        TodayCoachContext easyTitle = new TodayCoachContext(TODAY, Map.of(),
                Map.of("D1", new DayFact(OPEN_TODAY, "쉬운 영어 읽기", DayStatus.NOT_STARTED, DayPriority.HIGH, TODAY, null,
                        false, null)),
                Set.of("D1"), Map.of(), Map.of(), Map.of(), TodayCoachContext.WorkloadFact.NONE);
        assertThat(TodayCoachValidator.guessesDifficulty("'쉬운 영어 읽기'는 우선순위가 높아요", easyTitle)).isFalse();
        assertThat(TodayCoachValidator.guessesDifficulty("'쉬운 영어 읽기'는 가장 쉬운 일이에요", easyTitle)).isTrue();
    }

    @Test
    void unfinishedDaysAlwaysGetAnObservation() {
        TodayCoachResponse ignored = validate(answer("[]", """
                [{"message":"남은 Day가 1개예요","evidence":[{"type":"METRIC","ref":"todayOpenCount"}]}]
                """, "[]"));
        assertThat(ignored.observations()).hasSize(2);
        assertThat(ignored.observations().get(1).message()).isEqualTo(
                "어제 끝내지 못한 '주간 목표 작업' Day가 남아 있어요. 오늘 계획과 비교해 다시 배치할지, Recovery에서 정리할지 정해 보세요.");
        assertThat(ignored.observations().get(1).evidence()).extracting(e -> e.id())
                .containsExactly(GOAL_LINKED.toString(), "yesterdayUnfinishedCount");

        // Already covered by the model (DAY evidence of an unfinished Day): nothing is added.
        TodayCoachResponse covered = validate(answer("[]", """
                [{"message":"메일 정리가 이틀 밀렸어요","evidence":[{"type":"DAY","ref":"D3"}]}]
                """, "[]"));
        assertThat(covered.observations()).singleElement()
                .satisfies(o -> assertThat(o.message()).isEqualTo("메일 정리가 이틀 밀렸어요"));
    }

    @Test
    void overloadAlwaysGetsAComputedObservationWithinTheLimit() {
        String three = "[" + String.join(",", Collections.nCopies(3,
                "{\"message\":\"남은 Day가 있어요\",\"evidence\":[{\"type\":\"METRIC\",\"ref\":\"todayOpenCount\"}]}")) + "]";

        TodayCoachResponse response = validate(answer("[]", three, "[]"), context(OVERLOADED));

        assertThat(response.observations()).hasSize(3);
        assertThat(response.observations()).extracting(o -> o.message()).contains(
                "20:00~21:00에 Day 2개가 겹쳐 있어요(가능 1시간, 계획 2시간). 이 시간 안에 모두 끝내기는 어려워요.");
        assertThat(response.observations()).anySatisfy(o -> assertThat(o.evidence()).anySatisfy(e -> {
            assertThat(e.type()).isEqualTo(CoachEvidenceType.METRIC);
            assertThat(e.id()).isEqualTo("busyWindow1");
        }));
        assertThat(response.observations()).anySatisfy(o -> assertThat(o.message()).contains("끝내지 못한"));
    }

    @Test
    void noOverloadObservationWhenNothingOverlaps() {
        TodayCoachResponse response = validate(answer("[]", "[]", "[]"));
        assertThat(response.observations()).noneSatisfy(o -> assertThat(o.message()).contains("겹쳐"));
    }

    @Test
    void onlyOneDayIsRaisedToHigh() {
        TodayCoachResponse response = validate(answer("[]", "[]", """
                [{"type":"SET_PRIORITY","dayRef":"D1","message":"핵심이에요","proposedDate":null,"proposedPriority":"HIGH"},
                 {"type":"SET_PRIORITY","dayRef":"D5","message":"이것도요","proposedDate":null,"proposedPriority":"HIGH"},
                 {"type":"SET_PRIORITY","dayRef":"D3","message":"낮춰도 돼요","proposedDate":null,"proposedPriority":"LOW"}]
                """));

        assertThat(response.suggestions()).extracting(s -> s.message()).containsExactly("핵심이에요", "낮춰도 돼요");
    }
}
