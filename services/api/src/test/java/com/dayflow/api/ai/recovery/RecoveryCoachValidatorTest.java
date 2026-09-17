package com.dayflow.api.ai.recovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dayflow.api.ai.AiProviderException;
import com.dayflow.api.ai.recovery.RecoveryCoachContext.Candidate;
import com.dayflow.api.ai.recovery.RecoveryCoachDtos.RecoveryCoachResponse;
import com.dayflow.api.ai.recovery.RecoveryCoachDtos.RecoveryRecommendation;
import com.dayflow.api.recovery.RecoveryAction;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Recovery Coach answer checks against the domain options DayFlow offered (pure). */
class RecoveryCoachValidatorTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 18);
    private static final LocalDate TOMORROW = TODAY.plusDays(1);
    private static final UUID CORE = UUID.randomUUID();
    private static final UUID PERIOD = UUID.randomUUID();
    private static final UUID LOW = UUID.randomUUID();
    private static final UUID ENDED_WEEK = UUID.randomUUID();

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    private static RecoveryCoachContext context() {
        Map<String, Candidate> candidates = new LinkedHashMap<>();
        // Core, high priority, active WEEK Goal: no carry over (still inside the week), no drop support.
        candidates.put("D1", new Candidate(CORE, "보고서 초안", EnumSet.of(RecoveryAction.KEEP, RecoveryAction.REDUCE,
                RecoveryAction.MOVE, RecoveryAction.DROP), Set.of(TOMORROW, TODAY.plusDays(2)), Set.of(), false,
                Set.of("OVERDUE_D1", "IMPORTANCE_D1", "GOAL_D1")));
        // PERIOD Goal Day: never CARRY_OVER.
        candidates.put("D2", new Candidate(PERIOD, "기출 풀기", EnumSet.of(RecoveryAction.KEEP, RecoveryAction.MOVE,
                RecoveryAction.DROP), Set.of(TOMORROW), Set.of(), false, Set.of("OVERDUE_D2", "GOAL_D2")));
        // Low priority, no Goal, handled twice before: drop supported.
        candidates.put("D3", new Candidate(LOW, "서랍 정리", EnumSet.of(RecoveryAction.KEEP, RecoveryAction.MOVE,
                RecoveryAction.DROP), Set.of(TOMORROW), Set.of(), true, Set.of("OVERDUE_D3", "HISTORY_D3")));
        // Ended WEEK Goal: MOVE impossible, CARRY_OVER to offered dates.
        candidates.put("D4", new Candidate(ENDED_WEEK, "주간 정리", EnumSet.of(RecoveryAction.KEEP,
                RecoveryAction.CARRY_OVER, RecoveryAction.DROP), Set.of(), Set.of(TODAY.plusDays(3)), false,
                Set.of("OVERDUE_D4")));
        Map<String, String> evidence = new LinkedHashMap<>();
        evidence.put("CANDIDATES", "정리할 Day 4개");
        evidence.put("OVERDUE_D1", "'보고서 초안' 계획일(9월 16일(수))에서 2일 지남");
        evidence.put("IMPORTANCE_D1", "'보고서 초안' 핵심 Day · 우선순위 높음");
        evidence.put("GOAL_D1", "'보고서 초안' → '9월 3주' (주간 목표, 9월 14일(월)~9월 20일(일), 오늘 포함 3일 남음)");
        evidence.put("OVERDUE_D2", "'기출 풀기' 계획일(9월 17일(목))에서 1일 지남");
        evidence.put("GOAL_D2", "'기출 풀기' → '시험 준비' (기간 목표, 9월 1일(화)~9월 30일(수), 오늘 포함 13일 남음)");
        evidence.put("OVERDUE_D3", "'서랍 정리' 계획일(9월 8일(화))에서 10일 지남");
        evidence.put("HISTORY_D3", "'서랍 정리' 전에 2번 다시 정리함 (날짜 바꾸기 2)");
        evidence.put("OVERDUE_D4", "'주간 정리' 계획일(9월 11일(금))에서 7일 지남");
        evidence.put("LOAD_2026_09_19", "9월 19일(토) 남은 Day 1개 · 시간 배치 30분");
        return new RecoveryCoachContext(TODAY, Map.of(), candidates, evidence,
                List.of("보고서 초안", "기출 풀기", "서랍 정리", "주간 정리", "9월 3주", "시험 준비"), 4);
    }

    private RecoveryCoachResponse validate(String recommendations) {
        String json = """
                {"headline":"남은 Day를 정리해요","summary":"CANDIDATES","observations":[],"recommendations":%s}
                """.formatted(recommendations);
        return RecoveryCoachValidator.validate(jsonMapper.readTree(json), context(), Instant.parse("2026-09-18T00:00:00Z"));
    }

    private static String rec(String ref, String action, String date, String reason, String... keys) {
        return "{\"dayRef\":\"%s\",\"action\":\"%s\",\"targetDate\":%s,\"reason\":\"%s\",\"evidenceKeys\":[%s]}".formatted(ref,
                action, date == null ? "null" : "\"" + date + "\"", reason,
                String.join(",", java.util.Arrays.stream(keys).map(key -> "\"" + key + "\"").toList()));
    }

    @Test
    void keepsApplicableRecommendationsWithOfferedDates() {
        RecoveryCoachResponse response = validate("[" + String.join(",",
                rec("D1", "MOVE", "2026-09-19", "LOAD_2026_09_19", "OVERDUE_D1", "LOAD_2026_09_19"),
                rec("D4", "CARRY_OVER", "2026-09-21", "OVERDUE_D4", "OVERDUE_D4"),
                rec("D3", "DROP", null, "HISTORY_D3", "HISTORY_D3"),
                rec("D2", "KEEP", "2026-09-19", "GOAL_D2", "GOAL_D2")) + "]");

        assertThat(response.recommendations()).extracting(RecoveryRecommendation::dayId, RecoveryRecommendation::action,
                RecoveryRecommendation::targetDate).containsExactly(
                org.assertj.core.groups.Tuple.tuple(CORE, RecoveryAction.MOVE, TOMORROW),
                org.assertj.core.groups.Tuple.tuple(ENDED_WEEK, RecoveryAction.CARRY_OVER, TODAY.plusDays(3)),
                org.assertj.core.groups.Tuple.tuple(LOW, RecoveryAction.DROP, null),
                // KEEP never carries a date.
                org.assertj.core.groups.Tuple.tuple(PERIOD, RecoveryAction.KEEP, null));
        assertThat(response.recommendations().getFirst().reason()).isEqualTo("9월 19일(토) 남은 Day 1개 · 시간 배치 30분");
        assertThat(response.summary()).isEqualTo("정리할 Day 4개");
        assertThat(response.candidateCount()).isEqualTo(4);
    }

    @Test
    void removesHallucinatedRefsAndActionsOutsideTheDomain() {
        RecoveryCoachResponse response = validate("[" + String.join(",",
                rec("D9", "KEEP", null, "OVERDUE_D1", "OVERDUE_D1"),
                rec(UUID.randomUUID().toString(), "KEEP", null, "OVERDUE_D1", "OVERDUE_D1"),
                rec("D1", "DELETE", null, "OVERDUE_D1", "OVERDUE_D1"),
                // PERIOD Goal Day: carry over is not offered.
                rec("D2", "CARRY_OVER", "2026-09-21", "GOAL_D2", "GOAL_D2"),
                // Ended week: MOVE is not offered.
                rec("D4", "MOVE", "2026-09-19", "OVERDUE_D4", "OVERDUE_D4")) + "]");

        assertThat(response.recommendations()).isEmpty();
    }

    @Test
    void datesMustBeOfferedAndValid() {
        RecoveryCoachResponse response = validate("[" + String.join(",",
                rec("D1", "MOVE", "2026-09-30", "OVERDUE_D1", "OVERDUE_D1"),
                rec("D2", "MOVE", "2026-02-30", "OVERDUE_D2", "OVERDUE_D2"),
                rec("D3", "MOVE", null, "OVERDUE_D3", "OVERDUE_D3"),
                rec("D4", "CARRY_OVER", "2026-09-17", "OVERDUE_D4", "OVERDUE_D4")) + "]");

        assertThat(response.recommendations()).isEmpty();
    }

    @Test
    void dropNeedsDayflowSupportAndACitedSignal() {
        RecoveryCoachResponse response = validate("[" + String.join(",",
                // Core, high priority, active Goal: never dropped.
                rec("D1", "DROP", null, "OVERDUE_D1", "OVERDUE_D1"),
                // Supported, but the reason cites nothing about being overdue or handled before.
                rec("D3", "DROP", null, "CANDIDATES", "CANDIDATES")) + "]");
        assertThat(response.recommendations()).isEmpty();
    }

    @Test
    void oneRecommendationPerDayWithTheDaysOwnFactsWhenNoKeyIsValid() {
        RecoveryCoachResponse response = validate("[" + String.join(",",
                rec("D1", "KEEP", null, "OVERDUE_D1", "MADE_UP"),
                rec("D1", "KEEP", null, "OVERDUE_D1", "OVERDUE_D1"),
                rec("D1", "REDUCE", null, "OVERDUE_D1", "OVERDUE_D1"),
                // Keys written with dashes or lower case still resolve.
                rec("D2", "MOVE", "2026-09-19", "LOAD_2026_09_19", "load_2026-09-19")) + "]");
        assertThat(response.recommendations()).hasSize(2);
        assertThat(response.recommendations().getFirst().action()).isEqualTo(RecoveryAction.KEEP);
        assertThat(response.recommendations().getFirst().evidence()).extracting("key").containsExactly("OVERDUE_D1");
        assertThat(response.recommendations().get(1).evidence()).extracting("key").containsExactly("LOAD_2026_09_19");
        // DROP never gets facts attached: no cited signal, no recommendation.
        assertThat(validate("[" + rec("D3", "DROP", null, "OVERDUE_D3", "MADE_UP") + "]").recommendations()).isEmpty();
    }

    @Test
    void wrongNumbersGuessesAndRefsNeverReachTheUser() {
        RecoveryCoachResponse response = validate("[" + String.join(",",
                rec("D3", "DROP", null, "세 번 미뤘으니 5번째는 내려놓아요", "HISTORY_D3"),
                rec("D1", "KEEP", null, "의지가 있으면 오늘 끝낼 수 있어요", "OVERDUE_D1"),
                rec("D2", "MOVE", "2026-09-19", "D2는 내일로 옮겨 여유를 만들어요", "LOAD_2026_09_19"),
                rec("D4", "KEEP", null, "D4에는 KEEP 추천. OVERDUE_D4", "OVERDUE_D4")) + "]");

        // A DROP with made-up numbers is removed; valid actions keep DayFlow's facts as their reason instead.
        assertThat(response.recommendations()).extracting(RecoveryRecommendation::dayId, RecoveryRecommendation::reason)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(CORE, "'보고서 초안' 계획일(9월 16일(수))에서 2일 지남"),
                        org.assertj.core.groups.Tuple.tuple(PERIOD, "9월 19일(토) 남은 Day 1개 · 시간 배치 30분"),
                        org.assertj.core.groups.Tuple.tuple(ENDED_WEEK,
                                "'주간 정리'에는 그대로 두기 추천. '주간 정리' 계획일(9월 11일(금))에서 7일 지남"));
    }

    @Test
    void unusableAnswers() {
        assertThatThrownBy(() -> RecoveryCoachValidator.validate(jsonMapper.readTree("[]"), context(), Instant.now()))
                .isInstanceOf(AiProviderException.class);
        assertThatThrownBy(() -> RecoveryCoachValidator.validate(jsonMapper.readTree("{\"headline\":\"\"}"), context(),
                Instant.now())).isInstanceOf(AiProviderException.class);
    }

    @Test
    void weekdaysMustMatchTheDateTheyTalkAbout() {
        // 2026-09-19 is a Saturday (토); the model calls it Friday.
        String json = """
                {"headline":"보고서를 금요일로 옮겨요","summary":"토요일에는 남은 Day가 적어요",
                 "observations":[],"recommendations":[%s, %s]}
                """.formatted(rec("D1", "MOVE", "2026-09-19", "금요일로 옮기면 좋아요", "LOAD_2026_09_19"),
                rec("D2", "MOVE", "2026-09-19", "토요일로 옮겨요", "LOAD_2026_09_19"));
        RecoveryCoachResponse response = RecoveryCoachValidator.validate(jsonMapper.readTree(json), context(),
                Instant.parse("2026-09-18T00:00:00Z"));

        assertThat(response.headline()).isEqualTo(RecoveryCoachValidator.FALLBACK_HEADLINE);
        assertThat(response.summary()).isEqualTo("토요일에는 남은 Day가 적어요");
        assertThat(response.recommendations()).extracting(RecoveryRecommendation::reason)
                .containsExactly("9월 19일(토) 남은 Day 1개 · 시간 배치 30분", "토요일로 옮겨요");
    }
}
