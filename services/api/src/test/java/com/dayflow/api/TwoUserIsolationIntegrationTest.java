package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dayflow.api.UserApi.Hierarchy;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * AUTH-003: two users with the same names and periods never see or touch each other's data. User B's ids are
 * "not found" for user A on every read, change and delete, exactly like ids that do not exist.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class TwoUserIsolationIntegrationTest {

    private static final String TODAY = "2026-09-16";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AuthTestSupport auth;

    private UserApi a;
    private UserApi b;

    /** User B's data, created with the same names and periods user A uses. */
    private Hierarchy bGoals;
    private String bTag;
    private String bCategory;
    private String bDay;
    private String bPastDay;
    private String bEvent;
    private String bReview;
    private String bTryItem;
    private String bRecoveryEvent;
    private String bRecoveryDay;

    @BeforeEach
    void createUsers() throws Exception {
        a = new UserApi(auth.as(mockMvc, auth.newUser("user-a")));
        b = new UserApi(auth.as(mockMvc, auth.newUser("user-b")));

        bGoals = b.weekHierarchy("공부");
        bTag = b.tag("공부");
        bCategory = b.category("공부");
        bDay = b.day(bGoals.week(), "2026-09-17", bTag);
        bPastDay = b.day(null, "2026-09-10", null);
        bEvent = b.event("마감 일정", bCategory, bGoals.month());
        bReview = b.weekReview("B의 Try");
        bTryItem = JsonPath.read(bReview, "$.items[0].id");
        bRecoveryEvent = JsonPath.read(b.send(post("/api/v1/recovery/apply"), """
                {"localDate": "%s", "decisions": [{"dayId": "%s", "version": 0, "action": "KEEP"}]}
                """.formatted(TODAY, bPastDay)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
                "$.eventId");
        // The KEEP decision recorded the Day's state; changing the Day makes it a candidate for B again.
        b.send(patch("/api/v1/days/" + bPastDay), "{\"estimatedMinutes\": 30, \"version\": 0}").andExpect(status().isOk());
        bRecoveryDay = b.idOfOk(put("/api/v1/recovery-days/2026-09-18"),
                "{\"returnDate\": null, \"note\": \"쉬는 날\", \"expectedVersion\": null}");
    }

    @Test
    void bothUsersCanUseTheSameNamesAndPeriods() throws Exception {
        Hierarchy aGoals = a.weekHierarchy("공부");
        String aTag = a.tag("공부");
        String aCategory = a.category("공부");
        // Both users also start with their own "마감" default Category.
        a.send(post("/api/v1/event-categories"), "{\"name\": \"마감\", \"color\": \"#3a78b8\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DUPLICATE_EVENT_CATEGORY_NAME"));
        String aReview = a.weekReview("A의 Try");
        String aRecoveryDay = a.idOfOk(put("/api/v1/recovery-days/2026-09-18"),
                "{\"returnDate\": null, \"note\": \"A도 쉬는 날\", \"expectedVersion\": null}");

        assertThat(List.of(aGoals.year(), aGoals.week(), aTag, aCategory, aRecoveryDay))
                .doesNotContain(bGoals.year(), bGoals.week(), bTag, bCategory, bRecoveryDay);
        assertThat((String) JsonPath.read(aReview, "$.id")).isNotEqualTo(JsonPath.read(bReview, "$.id"));
        assertThat((Integer) JsonPath.read(aReview, "$.version")).isZero();
    }

    @Test
    void listsOnlyContainTheCurrentUsersData() throws Exception {
        String aDay = a.day(null, "2026-09-12", null);

        assertIds(a, get("/api/v1/goals"), "$[*].id").isEmpty();
        assertIds(a, get("/api/v1/days"), "$[*].id").containsExactly(aDay);
        assertIds(a, get("/api/v1/days").param("hasGoal", "true"), "$[*].id").isEmpty();
        assertIds(a, get("/api/v1/day-tags"), "$[*].id").isEmpty();
        assertIds(a, get("/api/v1/event-categories"), "$[*].name")
                .containsExactly("일정", "생일", "면접", "시험", "마감", "약속");
        assertIds(a, get("/api/v1/event-categories"), "$[*].id").doesNotContain(bCategory);
        assertIds(a, get("/api/v1/events"), "$[*].id").isEmpty();
        assertIds(a, get("/api/v1/events").param("linkedGoalId", bGoals.month()), "$[*].id").isEmpty();
        assertIds(a, get("/api/v1/event-occurrences").param("from", "2026-09-01").param("to", "2026-09-30"),
                "$[*].eventId").isEmpty();
        assertIds(a, get("/api/v1/recovery/candidates").param("today", TODAY).param("now", "2026-09-16T12:00:00+09:00"),
                "$[*].day.id").containsExactly(aDay);
        assertIds(a, get("/api/v1/recovery/events"), "$[*].id").isEmpty();
        assertIds(a, get("/api/v1/recovery-days").param("from", "2026-09-01").param("to", "2026-09-30"), "$[*].id")
                .isEmpty();
        a.mvc.perform(get("/api/v1/reviews/WEEK/2026-09-14"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("REVIEW_NOT_FOUND"));

        // B still sees all of it.
        assertIds(b, get("/api/v1/goals"), "$[*].id").contains(bGoals.year(), bGoals.week());
        assertIds(b, get("/api/v1/days"), "$[*].id").contains(bDay, bPastDay).doesNotContain(aDay);
        assertIds(b, get("/api/v1/events"), "$[*].id").containsExactly(bEvent);
        assertIds(b, get("/api/v1/recovery/candidates").param("today", TODAY).param("now", "2026-09-16T12:00:00+09:00"),
                "$[*].day.id").containsExactly(bPastDay);
        assertIds(b, get("/api/v1/recovery/events"), "$[*].id").containsExactly(bRecoveryEvent);
        assertIds(b, get("/api/v1/recovery-days").param("from", "2026-09-01").param("to", "2026-09-30"), "$[*].id")
                .containsExactly(bRecoveryDay);
    }

    @Test
    void anotherUsersIdsAreNotFoundForReadChangeAndDelete() throws Exception {
        expectNotFound(a.mvc.perform(get("/api/v1/goals/" + bGoals.week())), "GOAL_NOT_FOUND");
        expectNotFound(a.send(patch("/api/v1/goals/" + bGoals.year()), "{\"title\": \"탈취\", \"version\": 0}"), "GOAL_NOT_FOUND");
        expectNotFound(a.mvc.perform(delete("/api/v1/goals/" + bGoals.week())), "GOAL_NOT_FOUND");

        expectNotFound(a.mvc.perform(get("/api/v1/days/" + bDay)), "DAY_NOT_FOUND");
        expectNotFound(a.send(patch("/api/v1/days/" + bDay), "{\"title\": \"탈취\", \"version\": 0}"), "DAY_NOT_FOUND");
        expectNotFound(a.mvc.perform(delete("/api/v1/days/" + bDay)), "DAY_NOT_FOUND");
        expectNotFound(a.send(put("/api/v1/days/" + bDay + "/schedule"), """
                {"startAt": "2026-09-17T09:00:00+09:00", "endAt": "2026-09-17T10:00:00+09:00",
                 "timezone": "Asia/Seoul", "expectedVersion": null}
                """), "DAY_NOT_FOUND");
        expectNotFound(a.mvc.perform(delete("/api/v1/days/" + bDay + "/schedule")), "DAY_NOT_FOUND");

        expectNotFound(a.send(patch("/api/v1/day-tags/" + bTag), "{\"name\": \"탈취\", \"version\": 0}"), "DAY_TAG_NOT_FOUND");
        expectNotFound(a.mvc.perform(delete("/api/v1/day-tags/" + bTag)), "DAY_TAG_NOT_FOUND");

        expectNotFound(a.send(patch("/api/v1/event-categories/" + bCategory), "{\"name\": \"탈취\", \"version\": 0}"),
                "EVENT_CATEGORY_NOT_FOUND");
        expectNotFound(a.mvc.perform(delete("/api/v1/event-categories/" + bCategory)), "EVENT_CATEGORY_NOT_FOUND");

        expectNotFound(a.mvc.perform(get("/api/v1/events/" + bEvent)), "EVENT_NOT_FOUND");
        expectNotFound(a.send(patch("/api/v1/events/" + bEvent), "{\"title\": \"탈취\", \"version\": 0}"), "EVENT_NOT_FOUND");
        expectNotFound(a.mvc.perform(delete("/api/v1/events/" + bEvent).param("version", "0")), "EVENT_NOT_FOUND");

        expectNotFound(a.send(post("/api/v1/review-items/" + bTryItem + "/convert"), UserApi.dayJson(null, null, null)),
                "REVIEW_ITEM_NOT_FOUND");
        expectNotFound(a.send(post("/api/v1/recovery/apply"), """
                {"localDate": "%s", "decisions": [{"dayId": "%s", "version": 1, "action": "DROP"}]}
                """.formatted(TODAY, bPastDay)), "DAY_NOT_FOUND");
        expectNotFound(a.send(post("/api/v1/recovery/carry-over/preview"), """
                {"localDate": "%s", "sourceDayId": "%s", "targetDate": "2026-09-22", "mode": "WITHOUT_GOAL"}
                """.formatted(TODAY, bDay)), "DAY_NOT_FOUND");
        expectNotFound(a.mvc.perform(delete("/api/v1/recovery-days/2026-09-18")), "RECOVERY_DAY_NOT_FOUND");

        // Nothing of B changed.
        b.mvc.perform(get("/api/v1/goals/" + bGoals.year())).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("공부")).andExpect(jsonPath("$.version").value(0));
        b.mvc.perform(get("/api/v1/days/" + bDay)).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("공부하기")).andExpect(jsonPath("$.tags[0].id").value(bTag));
        b.mvc.perform(get("/api/v1/events/" + bEvent)).andExpect(status().isOk())
                .andExpect(jsonPath("$.category.id").value(bCategory));
        assertIds(b, get("/api/v1/day-tags"), "$[*].id").containsExactly(bTag);
        b.mvc.perform(get("/api/v1/reviews/WEEK/2026-09-14")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].convertedDayId").value(org.hamcrest.Matchers.nullValue()));
    }

    private static org.assertj.core.api.ListAssert<String> assertIds(UserApi user, MockHttpServletRequestBuilder request,
            String path) throws Exception {
        String body = user.mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> values = JsonPath.read(body, path);
        return assertThat(values);
    }

    private static void expectNotFound(org.springframework.test.web.servlet.ResultActions result, String code)
            throws Exception {
        result.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value(code));
    }
}
