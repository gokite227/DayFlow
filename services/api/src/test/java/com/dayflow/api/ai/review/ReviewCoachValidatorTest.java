package com.dayflow.api.ai.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dayflow.api.ai.AiProviderException;
import com.dayflow.api.ai.review.ReviewCoachDtos.ReviewCoachResponse;
import com.dayflow.api.ai.review.ReviewCoachDtos.ReviewDraftItem;
import com.dayflow.api.review.ReviewType;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Evidence, hallucination and wording checks of the Review Coach draft (pure, no Spring). */
class ReviewCoachValidatorTest {

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    private static ReviewCoachContext context(Set<String> timeKeys) {
        Map<String, String> evidence = new LinkedHashMap<>();
        evidence.put("COMPLETION", "계획한 Day 14개 중 9개 완료 (64%)");
        evidence.put("CORE_COMPLETION", "핵심 Day 4개 중 3개 완료");
        evidence.put("UNFINISHED", "미완료로 남아 있는 Day 5개");
        evidence.put("OVERBOOKED", "일정이 겹쳐 넘친 시간 3시간 (2일)");
        if (timeKeys.contains("TIME_EVENING")) {
            evidence.put("TIME_EVENING", "저녁(18~22시)에 배치된 Day 5개 중 1개 완료");
        } else {
            evidence.put("PATTERN_SAMPLE_LIMITED", "시간대마다 배치된 Day가 3개 미만이라 시간대 패턴은 판단하기 어려워요");
        }
        evidence.put("GOAL_1", "'알고리즘 공부' 기간 내 Day 6개 중 4개 완료");
        return new ReviewCoachContext(ReviewType.WEEK, LocalDate.of(2026, 8, 3), LocalDate.of(2026, 8, 9), Map.of(),
                evidence, timeKeys, Set.of(), Map.of("G1", "알고리즘 공부", "D1", "기출 풀기"),
                List.of("알고리즘 공부", "기출 풀기", "HIGH 우선 과제"), List.of("COMPLETION", "CORE_COMPLETION"));
    }

    private static final ReviewCoachContext WITH_EVENING = context(Set.of("TIME_EVENING"));
    private static final ReviewCoachContext SMALL_SAMPLE = context(Set.of());

    private ReviewCoachResponse validate(String json, ReviewCoachContext context) {
        return ReviewCoachValidator.validate(jsonMapper.readTree(json), context, Instant.parse("2026-08-10T00:00:00Z"));
    }

    private static String answer(String keep, String problem, String tries) {
        return """
                {"headline":"이번 주는 일정 밀도가 핵심이에요","summary":"COMPLETION","highlights":[],
                 "keep":%s,"problem":%s,"try":%s}
                """.formatted(keep, problem, tries);
    }

    private static String item(String text, String reason, String... keys) {
        return "{\"text\":\"%s\",\"reason\":\"%s\",\"evidenceKeys\":[%s]}".formatted(text, reason,
                String.join(",", java.util.Arrays.stream(keys).map(key -> "\"" + key + "\"").toList()));
    }

    @Test
    void validDraftKeepsEvidenceLabelsAndFacts() {
        ReviewCoachResponse response = validate(answer(
                "[" + item("핵심 Day를 먼저 배치한 흐름 유지하기", "CORE_COMPLETION", "CORE_COMPLETION") + "]",
                "[" + item("저녁 시간대에 배치한 일정이 끝나지 않고 남았어요", "TIME_EVENING", "TIME_EVENING", "OVERBOOKED") + "]",
                "[" + item("다음 주에는 저녁 8시 이후 Day를 하루 최대 1개만 배치하기", "저녁 배치 Day의 미완료가 많았어요", "TIME_EVENING") + "]"),
                WITH_EVENING);

        assertThat(response.type()).isEqualTo(ReviewType.WEEK);
        assertThat(response.periodEnd()).isEqualTo(LocalDate.of(2026, 8, 9));
        // An evidence key written as text becomes its label.
        assertThat(response.summary()).isEqualTo("계획한 Day 14개 중 9개 완료 (64%)");
        assertThat(response.keep()).singleElement().satisfies(keep -> {
            assertThat(keep.reason()).isEqualTo("핵심 Day 4개 중 3개 완료");
            assertThat(keep.evidence()).extracting(e -> e.label()).containsExactly("핵심 Day 4개 중 3개 완료");
        });
        assertThat(response.problem()).singleElement().satisfies(problem ->
                assertThat(problem.evidence()).extracting(e -> e.key()).containsExactly("TIME_EVENING", "OVERBOOKED"));
        // A TRY is a plan: its own numbers ("8시", "1개") are allowed.
        assertThat(response.tryItems()).extracting(ReviewDraftItem::text)
                .containsExactly("다음 주에는 저녁 8시 이후 Day를 하루 최대 1개만 배치하기");
        assertThat(response.facts()).extracting(e -> e.key()).containsExactly("COMPLETION", "CORE_COMPLETION");
    }

    @Test
    void unknownEvidenceKeysAreRemovedAndUnsupportedLinesDropped() {
        ReviewCoachResponse response = validate(answer(
                "[" + item("잘한 흐름 유지", "근거", "MADE_UP", "CORE_COMPLETION") + "," + item("근거 없는 칭찬", "좋았어요", "NOT_A_KEY") + "]",
                "[]", "[]"), WITH_EVENING);

        assertThat(response.keep()).singleElement().satisfies(keep ->
                assertThat(keep.evidence()).extracting(e -> e.key()).containsExactly("CORE_COMPLETION"));
    }

    @Test
    void wrongNumbersAreNotShown() {
        ReviewCoachResponse response = validate("""
                {"headline":"완료율 80%%를 달성했어요","summary":"14개 중 12개를 완료했어요.","highlights":[
                   {"message":"핵심 Day 4개 중 3개 완료","evidenceKeys":["CORE_COMPLETION"]},
                   {"message":"완료율이 80%%예요","evidenceKeys":["COMPLETION"]}],
                 "keep":[%s],"problem":[%s],"try":[]}
                """.formatted(item("9개를 완료한 흐름 유지", "14개 중 9개 완료", "COMPLETION"),
                item("미완료가 7개 남았어요", "UNFINISHED", "UNFINISHED")), WITH_EVENING);

        assertThat(response.headline()).isEqualTo(ReviewCoachValidator.FALLBACK_HEADLINE);
        assertThat(response.summary()).isEmpty();
        assertThat(response.highlights()).extracting(h -> h.message()).containsExactly("핵심 Day 4개 중 3개 완료");
        assertThat(response.keep()).hasSize(1);
        assertThat(response.problem()).isEmpty();
    }

    @Test
    void guessedCausesAndVagueTriesAreDropped() {
        ReviewCoachResponse response = validate(answer(
                "[" + item("핵심 Day 흐름 유지", "CORE_COMPLETION", "CORE_COMPLETION") + "]",
                "[" + item("의지가 부족했어요", "UNFINISHED", "UNFINISHED") + ","
                        + item("저녁에는 피곤해서 못 했어요", "TIME_EVENING", "TIME_EVENING") + ","
                        + item("집중력이 떨어진 것 같아요", "UNFINISHED", "UNFINISHED") + "]",
                "[" + item("더 열심히 하기", "UNFINISHED", "UNFINISHED") + ","
                        + item("스트레스를 줄이기", "UNFINISHED", "UNFINISHED") + ","
                        + item("다음 주에는 저녁 일정을 하루 1개로 줄이기", "TIME_EVENING", "TIME_EVENING") + "]"), WITH_EVENING);

        assertThat(response.problem()).isEmpty();
        assertThat(response.tryItems()).extracting(ReviewDraftItem::text).containsExactly("다음 주에는 저녁 일정을 하루 1개로 줄이기");
        assertThat(response.keep()).hasSize(1);
    }

    @Test
    void timeOfDayClaimsNeedEnoughSample() {
        String draft = answer("[]",
                "[" + item("저녁에 배치한 Day가 잘 끝나지 않았어요", "OVERBOOKED", "OVERBOOKED") + ","
                        + item("저녁 패턴은 기록이 적어 판단하기 어려워요", "PATTERN_SAMPLE_LIMITED", "PATTERN_SAMPLE_LIMITED") + "]",
                "[]");

        // Small sample: the claim has no TIME_* key to cite; only the "hard to judge" line survives.
        assertThat(validate(draft, SMALL_SAMPLE).problem()).extracting(ReviewDraftItem::text)
                .containsExactly("저녁 패턴은 기록이 적어 판단하기 어려워요");
        // With enough sample the model still has to cite the time key.
        assertThat(validate(draft, WITH_EVENING).problem()).isEmpty();
        String cited = answer("[]", "[" + item("저녁에 배치한 Day가 잘 끝나지 않았어요", "TIME_EVENING", "TIME_EVENING") + "]", "[]");
        assertThat(validate(cited, WITH_EVENING).problem()).hasSize(1);
        assertThat(validate(cited, SMALL_SAMPLE).problem()).isEmpty();
    }

    @Test
    void refsKeysAndEnumsAreRewrittenButTitlesStay() {
        ReviewCoachResponse response = validate(answer(
                "[" + item("G1과 연결된 D1 흐름 유지", "GOAL_1", "GOAL_1") + "]",
                "[" + item("HIGH 우선 과제가 MOVE로 여러 번 옮겨졌어요", "UNFINISHED", "UNFINISHED") + "]",
                "[" + item("EVENING Day는 DONE 처리 전에 D1부터 확인하기", "OVERBOOKED", "OVERBOOKED") + "]"), WITH_EVENING);

        assertThat(response.keep().getFirst().text()).isEqualTo("'알고리즘 공부'과 연결된 '기출 풀기' 흐름 유지");
        assertThat(response.keep().getFirst().reason()).isEqualTo("'알고리즘 공부' 기간 내 Day 6개 중 4개 완료");
        assertThat(response.problem().getFirst().text()).isEqualTo("HIGH 우선 과제가 날짜 바꾸기로 여러 번 옮겨졌어요");
        assertThat(response.tryItems().getFirst().text()).isEqualTo("저녁 Day는 완료 처리 전에 '기출 풀기'부터 확인하기");
        String all = response.keep() + " " + response.problem() + " " + response.tryItems();
        assertThat(all).doesNotContainPattern("(?<![A-Za-z0-9])[DG][0-9]+(?![A-Za-z0-9])");
    }

    @Test
    void limitsCountsLengthsAndDuplicates() {
        String longText = "가".repeat(400);
        String keep = "[" + String.join(",",
                item("핵심 Day 흐름 유지", "CORE_COMPLETION", "CORE_COMPLETION"),
                item("핵심 Day 흐름, 유지!", "CORE_COMPLETION", "CORE_COMPLETION"),
                item("핵심 day 흐름 유지", "COMPLETION", "COMPLETION"),
                item(longText, "COMPLETION", "COMPLETION"),
                item("완료 흐름 기록하기", "COMPLETION", "COMPLETION"),
                item("네 번째 항목", "COMPLETION", "COMPLETION")) + "]";

        ReviewCoachResponse response = validate(answer(keep, "[]", "[]"), WITH_EVENING);

        assertThat(response.keep()).hasSize(3);
        assertThat(response.keep()).extracting(ReviewDraftItem::text)
                .doesNotContain("핵심 Day 흐름, 유지!", "핵심 day 흐름 유지");
        assertThat(response.keep().get(1).text()).hasSize(ReviewCoachPrompt.MAX_TEXT);
    }

    @Test
    void userTitlesAreNotJudged() {
        // "HIGH 우선 과제" and the Goal title are the user's words; a title containing a cause word is not a claim.
        ReviewCoachContext context = new ReviewCoachContext(ReviewType.DAY, LocalDate.of(2026, 8, 3), LocalDate.of(2026, 8, 3),
                Map.of(), Map.of("UNFINISHED", "미완료로 남아 있는 Day 1개"), Set.of(), Set.of(), Map.of(),
                List.of("스트레스 관리 공부"), List.of());
        ReviewCoachResponse response = validate(answer("[]",
                "[" + item("'스트레스 관리 공부'가 미완료로 남았어요", "UNFINISHED", "UNFINISHED") + "]", "[]"), context);
        assertThat(response.problem()).hasSize(1);
    }

    @Test
    void unusableAnswers() {
        assertThatThrownBy(() -> validate("{\"headline\":\" \"}", WITH_EVENING)).isInstanceOf(AiProviderException.class);
        assertThatThrownBy(() -> validate("[]", WITH_EVENING)).isInstanceOf(AiProviderException.class);
        ReviewCoachResponse partial = validate("{\"headline\":\"정리했어요\",\"keep\":\"x\"}", WITH_EVENING);
        assertThat(partial.keep()).isEmpty();
        assertThat(partial.tryItems()).isEmpty();
    }
}
