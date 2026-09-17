package com.dayflow.api.ai.planning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dayflow.api.ai.AiProviderException;
import com.dayflow.api.ai.planning.PlanningCoachContext.DayOption;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningCoachResponse;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningDaySuggestion;
import com.dayflow.api.ai.planning.PlanningCoachDtos.PlanningSuggestionType;
import com.dayflow.api.day.DayPriority;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Planning Coach answer checks: only applicable, evidence-backed suggestions survive (pure). */
class PlanningCoachValidatorTest {

    private static final LocalDate MON = LocalDate.of(2026, 9, 21);
    private static final UUID EVENING = UUID.randomUUID();
    private static final UUID UNDATED = UUID.randomUUID();
    private static final UUID DONE = UUID.randomUUID();
    private static final UUID GOAL = UUID.randomUUID();

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    private static PlanningCoachContext context() {
        Set<LocalDate> plannable = new LinkedHashSet<>();
        for (int i = 0; i < 7; i++) {
            plannable.add(MON.plusDays(i));
        }
        Map<String, DayOption> days = new LinkedHashMap<>();
        days.put("D1", new DayOption(EVENING, "영어 복습", false, DayPriority.MEDIUM, MON.plusDays(1),
                Set.of(MON, MON.plusDays(2), MON.plusDays(3)), LocalTime.of(20, 0), 60));
        days.put("D2", new DayOption(UNDATED, "단어장 정리", false, DayPriority.LOW, null,
                Set.of(MON, MON.plusDays(1), MON.plusDays(2)), null, 0));
        days.put("D3", new DayOption(DONE, "모의고사", true, DayPriority.HIGH, MON, Set.of(), null, 0));
        Map<String, String> evidence = new LinkedHashMap<>();
        evidence.put("PLANNED_DAYS", "이 기간에 목표와 연결된 Day 2개 (완료 1개)");
        evidence.put("LOAD_2026_09_22", "9월 22일(화) 남은 Day 4개 · 시간 배치 4시간 · 겹침 2시간 · 저녁 이후 배치 3개");
        evidence.put("LOAD_2026_09_23", "9월 23일(수) 남은 Day 1개");
        evidence.put("RECENT_TIME_EVENING", "최근 14일 저녁(18~22시)에 배치된 Day 12개 중 3개 완료");
        evidence.put("PREVIOUS_TRY_1", "지난 주간 회고 TRY: '저녁 일정은 하루 1개만 잡기'");
        evidence.put("PREVIOUS_TRY_2", "지난 주간 회고 TRY: '토요일 오전에 오답 노트 쓰기'");
        return new PlanningCoachContext(GOAL, "토익 900", MON, MON.plusDays(6), plannable, Map.of(), days, evidence,
                Map.of("PREVIOUS_TRY_1", "저녁 일정은 하루 1개만 잡기", "PREVIOUS_TRY_2", "토요일 오전에 오답 노트 쓰기"),
                List.of("토익 900", "영어 복습", "단어장 정리", "모의고사", "저녁 일정은 하루 1개만 잡기", "토요일 오전에 오답 노트 쓰기"),
                List.of("PLANNED_DAYS"));
    }

    private PlanningCoachResponse validate(String suggestions, String proposals) {
        String json = """
                {"headline":"화요일 저녁이 몰려 있어요","summary":"PLANNED_DAYS","observations":[
                  {"message":"LOAD_2026_09_22","evidenceKeys":["LOAD_2026_09_22"]}],
                 "existingDaySuggestions":%s,"newDayProposals":%s}
                """.formatted(suggestions, proposals);
        return PlanningCoachValidator.validate(jsonMapper.readTree(json), context(), Instant.parse("2026-09-20T00:00:00Z"));
    }

    private static String suggestion(String ref, String type, String date, String start, String priority, String reason,
            String... keys) {
        return "{\"dayRef\":\"%s\",\"type\":\"%s\",\"targetDate\":%s,\"startTime\":%s,\"priority\":%s,\"reason\":\"%s\",\"evidenceKeys\":[%s]}"
                .formatted(ref, type, quote(date), quote(start), quote(priority), reason, keyList(keys));
    }

    private static String proposal(String title, String date, String priority, String reason, String... keys) {
        return "{\"title\":\"%s\",\"proposedDate\":%s,\"priority\":\"%s\",\"reason\":\"%s\",\"evidenceKeys\":[%s]}"
                .formatted(title, quote(date), priority, reason, keyList(keys));
    }

    private static String quote(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }

    private static String keyList(String... keys) {
        return String.join(",", java.util.Arrays.stream(keys).map(key -> "\"" + key + "\"").toList());
    }

    @Test
    void keepsApplicableSuggestions() {
        PlanningCoachResponse response = validate("[" + String.join(",",
                suggestion("D1", "SET_SCHEDULE", "2026-09-23", "10:30", null, "LOAD_2026_09_23", "LOAD_2026_09_23", "LOAD_2026_09_22"),
                suggestion("D2", "SET_DATE", "2026-09-23", null, null, "LOAD_2026_09_23", "LOAD_2026_09_23")) + "]", "[]");

        assertThat(response.suggestions()).extracting(PlanningDaySuggestion::type, PlanningDaySuggestion::targetDate,
                PlanningDaySuggestion::startTime, PlanningDaySuggestion::endTime).containsExactly(
                org.assertj.core.groups.Tuple.tuple(PlanningSuggestionType.SET_SCHEDULE, MON.plusDays(2), "10:30", "11:30"),
                org.assertj.core.groups.Tuple.tuple(PlanningSuggestionType.SET_DATE, MON.plusDays(2), null, null));
        assertThat(response.observations().getFirst().message())
                .isEqualTo("9월 22일(화) 남은 Day 4개 · 시간 배치 4시간 · 겹침 2시간 · 저녁 이후 배치 3개");
        assertThat(response.targetStart()).isEqualTo(MON);
    }

    @Test
    void removesInventedFinishedAndNoOpSuggestions() {
        PlanningCoachResponse response = validate("[" + String.join(",",
                suggestion("D9", "OPEN_DAY", null, null, null, "PLANNED_DAYS", "PLANNED_DAYS"),
                suggestion("D3", "SET_DATE", "2026-09-23", null, null, "PLANNED_DAYS", "PLANNED_DAYS"),
                // Not one of its date options (outside the offered dates, or its current date).
                suggestion("D1", "SET_DATE", "2026-09-22", null, null, "PLANNED_DAYS", "PLANNED_DAYS"),
                suggestion("D2", "SET_DATE", "2026-10-30", null, null, "PLANNED_DAYS", "PLANNED_DAYS"),
                // Unscheduled Day cannot get a time placement (its duration is unknown).
                suggestion("D2", "SET_SCHEDULE", "2026-09-23", "09:00", null, "PLANNED_DAYS", "PLANNED_DAYS"),
                // Same priority, invalid priority.
                suggestion("D2", "SET_PRIORITY", null, null, "LOW", "PLANNED_DAYS", "PLANNED_DAYS"),
                suggestion("D2", "SET_PRIORITY", null, null, "URGENT", "PLANNED_DAYS", "PLANNED_DAYS")) + "]", "[]");
        assertThat(response.suggestions()).isEmpty();
    }

    @Test
    void schedulesKeepDurationAndStayOnTheDate() {
        PlanningCoachResponse response = validate("[" + String.join(",",
                suggestion("D1", "SET_SCHEDULE", "2026-09-23", "23:30", null, "LOAD_2026_09_23", "LOAD_2026_09_23"),
                suggestion("D1", "SET_SCHEDULE", "2026-09-22", "20:00", null, "LOAD_2026_09_22", "LOAD_2026_09_22"),
                suggestion("D1", "SET_SCHEDULE", "2026-09-23", "9:00", null, "LOAD_2026_09_23", "LOAD_2026_09_23"),
                suggestion("D1", "SET_SCHEDULE", "2026-09-30", "09:00", null, "LOAD_2026_09_23", "LOAD_2026_09_23")) + "]", "[]");
        assertThat(response.suggestions()).isEmpty();
    }

    @Test
    void limitsPriorityInflation() {
        PlanningCoachResponse response = validate("[" + String.join(",",
                suggestion("D1", "SET_PRIORITY", null, null, "HIGH", "PLANNED_DAYS", "PLANNED_DAYS"),
                suggestion("D2", "SET_PRIORITY", null, null, "HIGH", "PLANNED_DAYS", "PLANNED_DAYS")) + "]",
                "[" + proposal("저녁 일정 1개로 줄이기", null, "HIGH", "PREVIOUS_TRY_1", "PREVIOUS_TRY_1") + "]");
        assertThat(response.suggestions()).singleElement()
                .satisfies(item -> assertThat(item.dayId()).isEqualTo(EVENING));
        assertThat(response.proposals()).isEmpty();
    }

    @Test
    void newDaysNeedAConcreteTryWhoseWordsTheyReuse() {
        PlanningCoachResponse response = validate("[]", "[" + String.join(",",
                // No TRY behind it: invented from the Goal title.
                proposal("단어 100개 외우기", "2026-09-23", "MEDIUM", "PLANNED_DAYS", "PLANNED_DAYS"),
                // Cites a TRY but the title has nothing of it.
                proposal("리스닝 1시간", "2026-09-23", "MEDIUM", "PREVIOUS_TRY_1", "PREVIOUS_TRY_1"),
                // Valid.
                proposal("토요일 오전 오답 노트 쓰기", "2026-09-26", "MEDIUM", "PREVIOUS_TRY_2", "PREVIOUS_TRY_2"),
                // Same date again: one new Day per date.
                proposal("저녁 일정 하루 1개만 두기", "2026-09-26", "LOW", "PREVIOUS_TRY_1", "PREVIOUS_TRY_1"),
                // A copy of an existing Day.
                proposal("영어 복습", null, "LOW", "PREVIOUS_TRY_1", "PREVIOUS_TRY_1")) + "]");

        assertThat(response.proposals()).singleElement().satisfies(item -> {
            assertThat(item.title()).isEqualTo("토요일 오전 오답 노트 쓰기");
            assertThat(item.proposedDate()).isEqualTo(MON.plusDays(5));
        });
    }

    @Test
    void availabilityGuessesCausesAndRefsNeverReachTheUser() {
        PlanningCoachResponse response = validate("[" + String.join(",",
                suggestion("D2", "SET_DATE", "2026-09-23", null, null, "수요일은 시간이 충분해요", "LOAD_2026_09_23"),
                suggestion("D1", "SET_DATE", "2026-09-23", null, null, "D1은 SET_DATE로 옮겨요. LOAD_2026_09_23", "LOAD_2026_09_23"),
                // Finished Days never get a suggestion, whatever the wording.
                suggestion("D3", "SET_DATE", "2026-09-23", null, null, "D3은 옮겨요", "LOAD_2026_09_23")) + "]", "[]");

        // Guessed wording is replaced by DayFlow's own evidence label; the applicable change itself is kept.
        assertThat(response.suggestions()).extracting(PlanningDaySuggestion::dayTitle, PlanningDaySuggestion::reason)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("단어장 정리", "9월 23일(수) 남은 Day 1개"),
                        org.assertj.core.groups.Tuple.tuple("영어 복습", "'영어 복습'은 날짜 정하기로 옮겨요. 9월 23일(수) 남은 Day 1개"));
        PlanningCoachResponse tired = validate(
                "[" + suggestion("D1", "OPEN_DAY", null, null, null, "피곤해서 저녁에 못 해요", "RECENT_TIME_EVENING") + "]", "[]");
        assertThat(tired.suggestions()).singleElement().satisfies(item -> assertThat(item.reason())
                .isEqualTo(item.evidence().getFirst().label()).doesNotContain("피곤"));
        assertThat(response.headline()).isEqualTo("화요일 저녁이 몰려 있어요");
    }

    @Test
    void unusableAnswers() {
        assertThatThrownBy(() -> PlanningCoachValidator.validate(jsonMapper.readTree("[]"), context(), Instant.now()))
                .isInstanceOf(AiProviderException.class);
        assertThat(PlanningCoachValidator.sharesWord("저녁 일정 줄이기", "저녁 일정은 하루 1개만")).isTrue();
        assertThat(PlanningCoachValidator.sharesWord("리스닝 1시간", "저녁 일정은 하루 1개만")).isFalse();
    }

    @Test
    void weekdaysMatchDatesAndLoadAloneNeverChangesPriority() {
        PlanningCoachResponse response = validate("[" + String.join(",",
                // 2026-09-23 is a Wednesday (수).
                suggestion("D2", "SET_DATE", "2026-09-23", null, null, "목요일로 옮겨요", "LOAD_2026_09_23"),
                suggestion("D1", "SET_PRIORITY", null, null, "LOW", "겹친 날이라 낮춰요", "LOAD_2026_09_22")) + "]", "[]");

        assertThat(response.suggestions()).singleElement().satisfies(item -> {
            assertThat(item.type()).isEqualTo(PlanningSuggestionType.SET_DATE);
            assertThat(item.reason()).isEqualTo("9월 23일(수) 남은 Day 1개");
        });
        assertThat(PlanningCoachValidator.validate(jsonMapper.readTree("""
                {"headline":"일요일 저녁이 몰려 있어요","summary":"","observations":[
                  {"message":"LOAD_2026_09_22","evidenceKeys":["LOAD_2026_09_22"]}],
                 "existingDaySuggestions":[],"newDayProposals":[]}
                """), context(), Instant.now()).headline()).isEqualTo(PlanningCoachValidator.FALLBACK_HEADLINE);
    }
}
