package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dayflow.api.UserApi.Hierarchy;
import com.jayway.jsonpath.JsonPath;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Review archive: list, filter, search (KPT text and linked Goal titles), counts, pages and ownership. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ReviewArchiveApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AuthTestSupport auth;

    private UserApi a;
    private UserApi b;
    private String weekGoal;
    private String nextWeekGoal;
    private String examGoal;

    /**
     * User A: one review of every type (newest period first: DAY 9/16, WEEK 9/14, MONTH 9/1, QUARTER 7/1,
     * YEAR 1/1). User B: a review with the same words and a same-named Goal, which A must never see.
     */
    @BeforeEach
    void createReviews() throws Exception {
        a = new UserApi(auth.as(mockMvc, auth.newUser("archive-a")));
        b = new UserApi(auth.as(mockMvc, auth.newUser("archive-b")));

        Hierarchy goals = a.weekHierarchy("백엔드 준비");
        weekGoal = goals.week();
        nextWeekGoal = a.goal(goals.month(), "WEEK", "2026-09-21", "2026-09-27", "다음 주 체력");
        examGoal = a.created(post("/api/v1/goals"), periodGoalJson("중간고사 준비"));

        save(a, "DAY", "2026-09-16", 5, "{\"id\":null,\"kind\":\"KEEP\",\"content\":\"새벽 운동 유지\"}");
        save(a, "WEEK", "2026-09-14", 4, """
                {"id":null,"kind":"KEEP","content":"알고리즘 루틴","goalId":"%s"},
                {"id":null,"kind":"PROBLEM","content":"잠이 부족했다"},
                {"id":null,"kind":"TRY","content":"운동 30분","goalId":"%s","targetGoalId":"%s"}
                """.formatted(weekGoal, weekGoal, nextWeekGoal));
        save(a, "MONTH", "2026-09-01", null,
                "{\"id\":null,\"kind\":\"PROBLEM\",\"content\":\"계획이 밀렸다\",\"goalId\":\"%s\"}".formatted(examGoal));
        save(a, "QUARTER", "2026-07-01", 3, "{\"id\":null,\"kind\":\"TRY\",\"content\":\"Portfolio Review 매주\"}");
        save(a, "YEAR", "2026-01-01", 2, "");

        String bExam = b.created(post("/api/v1/goals"), periodGoalJson("중간고사 준비"));
        save(b, "WEEK", "2026-09-14", 1,
                "{\"id\":null,\"kind\":\"KEEP\",\"content\":\"운동 알고리즘 포트폴리오\",\"goalId\":\"%s\"}".formatted(bExam));
    }

    @Test
    void listsOnlyTheCurrentUsersReviewsNewestPeriodFirstWithCounts() throws Exception {
        a.mvc.perform(get("/api/v1/reviews"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(5)))
                .andExpect(jsonPath("$.items[*].type").value(contains("DAY", "WEEK", "MONTH", "QUARTER", "YEAR")))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.hasNext").value(false))
                // WEEK: one line of each kind, the WEEK Goal (linked twice) and the next Goal count once each.
                .andExpect(jsonPath("$.items[1].periodStart").value("2026-09-14"))
                .andExpect(jsonPath("$.items[1].periodEnd").value("2026-09-20"))
                .andExpect(jsonPath("$.items[1].rating").value(4))
                .andExpect(jsonPath("$.items[1].preview").value("알고리즘 루틴"))
                .andExpect(jsonPath("$.items[1].keepCount").value(1))
                .andExpect(jsonPath("$.items[1].problemCount").value(1))
                .andExpect(jsonPath("$.items[1].tryCount").value(1))
                .andExpect(jsonPath("$.items[1].linkedGoalCount").value(2))
                .andExpect(jsonPath("$.items[2].linkedGoalCount").value(1))
                .andExpect(jsonPath("$.items[2].rating").value(nullValue()))
                // A review without lines is still listed.
                .andExpect(jsonPath("$.items[4].preview").value(nullValue()))
                .andExpect(jsonPath("$.items[4].keepCount").value(0))
                .andExpect(jsonPath("$.items[4].linkedGoalCount").value(0));

        b.mvc.perform(get("/api/v1/reviews"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].preview").value("운동 알고리즘 포트폴리오"));
    }

    @Test
    void filtersByEveryTypeAndWithoutFilter() throws Exception {
        for (String type : List.of("DAY", "WEEK", "MONTH", "QUARTER", "YEAR")) {
            a.mvc.perform(get("/api/v1/reviews").param("type", type))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items", hasSize(1)))
                    .andExpect(jsonPath("$.items[0].type").value(type));
        }
        a.mvc.perform(get("/api/v1/reviews").param("type", "WEEK").param("q", "   "))
                .andExpect(jsonPath("$.items", hasSize(1)));
    }

    @Test
    void searchesKptTextAndLinkedGoalTitlesWithoutDuplicatesOrOtherUsers() throws Exception {
        expectTypes("새벽", "DAY");                      // KEEP
        expectTypes("잠이 부족", "WEEK");                 // PROBLEM
        expectTypes("  운동  ", "DAY", "WEEK");           // TRY + KEEP, trimmed; B's "운동" is not listed
        expectTypes("PORTFOLIO review", "QUARTER");      // case-insensitive
        expectTypes("백엔드", "WEEK");                    // CALENDAR Goal title, linked by two lines → one row
        expectTypes("다음 주 체력", "WEEK");               // next Goal (targetGoalId) title
        expectTypes("중간고사", "MONTH");                  // PERIOD Goal title; B's same-named Goal is ignored
        expectTypes("100%", new String[0]);              // % is literal, not a wildcard
        expectTypes("없는 단어", new String[0]);

        // type + search combine.
        a.mvc.perform(get("/api/v1/reviews").param("type", "WEEK").param("q", "운동"))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].type").value("WEEK"));
        a.mvc.perform(get("/api/v1/reviews").param("type", "MONTH").param("q", "운동"))
                .andExpect(jsonPath("$.items", hasSize(0)));
    }

    @Test
    void pagesAreStableWithoutDuplicatesOrGaps() throws Exception {
        List<String> ids = new ArrayList<>();
        for (int page = 0; page < 3; page++) {
            String body = a.mvc.perform(get("/api/v1/reviews").param("page", String.valueOf(page)).param("size", "2"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.hasNext").value(page < 2))
                    .andReturn().getResponse().getContentAsString();
            ids.addAll(JsonPath.read(body, "$.items[*].id"));
        }
        String all = a.mvc.perform(get("/api/v1/reviews")).andReturn().getResponse().getContentAsString();
        List<String> expected = JsonPath.read(all, "$.items[*].id");
        assertThat(ids).doesNotHaveDuplicates().containsExactlyElementsOf(expected);

        a.mvc.perform(get("/api/v1/reviews").param("page", "5").param("size", "2"))
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.hasNext").value(false));
        a.mvc.perform(get("/api/v1/reviews").param("size", "0")).andExpect(status().isBadRequest());
        a.mvc.perform(get("/api/v1/reviews").param("size", "51")).andExpect(status().isBadRequest());
        a.mvc.perform(get("/api/v1/reviews").param("page", "-1")).andExpect(status().isBadRequest());
        a.mvc.perform(get("/api/v1/reviews").param("q", "x".repeat(101))).andExpect(status().isBadRequest());
    }

    @Test
    void detailOpensOnlyTheOwnReview() throws Exception {
        a.mvc.perform(get("/api/v1/reviews/MONTH/2026-09-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].goalId").value(examGoal));
        // B knows the period identity of A's review but only ever reaches B's own (unsaved) review.
        b.mvc.perform(get("/api/v1/reviews/MONTH/2026-09-01"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("REVIEW_NOT_FOUND"));
    }

    private void expectTypes(String q, String... types) throws Exception {
        ResultActions result = a.mvc.perform(get("/api/v1/reviews").param("q", q))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(types.length)));
        if (types.length > 0) {
            result.andExpect(jsonPath("$.items[*].type").value(contains(types)));
        }
    }

    private static void save(UserApi user, String type, String periodStart, Integer rating, String items) throws Exception {
        user.send(put("/api/v1/reviews/" + type + "/" + periodStart), """
                {"rating": %s, "completed": true, "expectedVersion": null, "items": [%s]}
                """.formatted(rating, items))
                .andExpect(status().isOk());
    }

    private static String periodGoalJson(String title) {
        return """
                {"kind":"PERIOD","parentGoalId":null,"type":null,"title":"%s","why":"",
                 "startDate":"2026-09-10","endDate":"2026-10-08","priority":1,"progressPolicy":"AUTO"}
                """.formatted(title);
    }
}
