package com.dayflow.api.ai.today;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The fixed Today Coach instructions carry the quality rules (checked as text, no model involved). */
class TodayCoachPromptTest {

    private static final String RULES = TodayCoachPrompt.INSTRUCTIONS;

    @Test
    void forbidsGuessingDifficultyFromTitles() {
        assertThat(RULES).contains("난이도, 부담, 소요 시간을 title만 보고 추측하지 않는다")
                .contains("\"가장 쉬운 일\"")
                .contains("주관적 난이도 데이터가 없다");
        // Nothing tells the model to start with easy-looking work.
        assertThat(TodayCoachValidator.guessesDifficulty(RULES.replaceAll("\"[^\"]*\"", ""))).isFalse();
        assertThat(RULES).doesNotContain("쉬운 일부터").doesNotContain("쉬운 Day");
    }

    @Test
    void usesObjectivePriorityCriteriaAndComputedNumbers() {
        assertThat(RULES).contains("core").contains("priority").contains("활성 Goal 연결").contains("daysOverdue")
                .contains("scheduledMinutes").contains("workload.busyWindows").contains("goals.daysLeft")
                .contains("scheduledMinutes가 null인 Day의 시간은 추정하지 않는다")
                .contains("직접 계산하거나 만들어내지 않는다");
    }

    @Test
    void requiresRecentUnfinishedDaysToBeAddressed() {
        assertThat(RULES).contains("unfinishedSummary.mustBeAddressed가 true이면 observations 중 최소 1개는 미완료 현황을 다룬다")
                .contains("오늘 먼저 처리 / 다른 날로 다시 배치 / 오늘은 제외")
                .contains("sameGoalAsTodayDay")
                .contains("미완료라는 이유만으로 우선순위를 올리지 않는다")
                .contains("Recovery");
    }

    @Test
    void requiresOverloadHandlingWithReschedules() {
        assertThat(RULES).contains("우선순위 나열로 끝내지 않는다")
                .contains("동시에 할 수 있다고 가정하지 않는다")
                .contains("RESCHEDULE_DAY를 쓴다")
                .contains("충돌이 심하면 이동을 제안할 수 있다")
                .contains("priority를 올려서 해결하지 않는다")
                .contains("SET_PRIORITY로 높음을 제안하는 것은 최대 1개");
    }

    @Test
    void forbidsInternalRefsAndEnumsInUserText() {
        assertThat(RULES).contains("Never mention internal references such as D1, G1, R1 in user-facing text.")
                .contains("영문 enum(HIGH, MEDIUM, LOW");
    }
}
