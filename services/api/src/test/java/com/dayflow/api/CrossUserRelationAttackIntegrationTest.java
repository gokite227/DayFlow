package com.dayflow.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dayflow.api.UserApi.Hierarchy;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * AUTH-003: user A tries to connect A's data to user B's rows by id. Every attempt is rejected with the same
 * answer an unknown id gets, and the same request with A's own row succeeds (so ownership is what fails).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class CrossUserRelationAttackIntegrationTest {

    private static final String TODAY = "2026-09-16";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AuthTestSupport auth;

    private UserApi a;
    private UserApi b;
    private Hierarchy aGoals;
    private Hierarchy bGoals;

    @BeforeEach
    void createUsers() throws Exception {
        a = new UserApi(auth.as(mockMvc, auth.newUser("attacker-a")));
        b = new UserApi(auth.as(mockMvc, auth.newUser("victim-b")));
        aGoals = a.weekHierarchy("A 목표");
        bGoals = b.weekHierarchy("B 목표");
    }

    @Test
    void dayCannotUseAnotherUsersGoal() throws Exception {
        rejected(a.send(post("/api/v1/days"), UserApi.dayJson(bGoals.week(), "2026-09-15", null)), "DAY_REQUIRES_WEEK_GOAL");
        String aDay = a.day(aGoals.week(), "2026-09-15", null);
        rejected(a.send(patch("/api/v1/days/" + aDay), "{\"goalId\": \"%s\", \"version\": 0}".formatted(bGoals.week())),
                "DAY_REQUIRES_WEEK_GOAL");
        a.mvc.perform(get("/api/v1/days/" + aDay)).andExpect(jsonPath("$.goalId").value(aGoals.week()));
    }

    @Test
    void dayCannotUseAnotherUsersTag() throws Exception {
        String bTag = b.tag("공부");
        rejected(a.send(post("/api/v1/days"), UserApi.dayJson(null, null, bTag)), "INVALID_DAY_TAG");

        String aDay = a.day(null, null, a.tag("공부"));
        rejected(a.send(patch("/api/v1/days/" + aDay), "{\"tagIds\": [\"%s\"], \"version\": 0}".formatted(bTag)),
                "INVALID_DAY_TAG");
    }

    @Test
    void goalCannotHangUnderAnotherUsersGoal() throws Exception {
        rejected(a.send(post("/api/v1/goals"), """
                {"parentGoalId": "%s", "type": "QUARTER", "title": "탈취", "why": "", "startDate": "2026-07-01",
                 "endDate": "2026-09-30", "priority": 1, "progressPolicy": "AUTO"}
                """.formatted(bGoals.year())), "INVALID_GOAL_PARENT");
        rejected(a.send(patch("/api/v1/goals/" + aGoals.quarter()),
                "{\"parentGoalId\": \"%s\", \"version\": 0}".formatted(bGoals.year())), "INVALID_GOAL_PARENT");
    }

    @Test
    void eventCannotUseAnotherUsersCategoryOrGoal() throws Exception {
        String bCategory = b.category("마감 관리");
        rejected(a.send(post("/api/v1/events"), UserApi.eventJson("A 일정", bCategory, null)), "INVALID_EVENT_CATEGORY");
        rejected(a.send(post("/api/v1/events"), UserApi.eventJson("A 일정", null, bGoals.month())), "INVALID_EVENT_GOAL");

        String aEvent = a.event("A 일정", a.category("마감 관리"), aGoals.month());
        rejected(a.send(patch("/api/v1/events/" + aEvent), "{\"categoryId\": \"%s\", \"version\": 0}".formatted(bCategory)),
                "INVALID_EVENT_CATEGORY");
        rejected(a.send(patch("/api/v1/events/" + aEvent),
                "{\"linkedGoalId\": \"%s\", \"version\": 0}".formatted(bGoals.week())), "INVALID_EVENT_GOAL");
        a.mvc.perform(get("/api/v1/events/" + aEvent))
                .andExpect(jsonPath("$.linkedGoalId").value(aGoals.month()))
                .andExpect(jsonPath("$.version").value(0));
    }

    @Test
    void reviewLinesCannotPointAtAnotherUsersGoals() throws Exception {
        rejected(saveWeekReview(a, "KEEP", "goalId", bGoals.week()), "INVALID_REVIEW_GOAL");

        String bNextWeek = b.goal(bGoals.month(), "WEEK", "2026-09-21", "2026-09-27", "B 다음 주");
        rejected(saveWeekReview(a, "TRY", "targetGoalId", bNextWeek), "INVALID_REVIEW_GOAL");

        // The same lines with A's own Goals are valid.
        String aNextWeek = a.goal(aGoals.month(), "WEEK", "2026-09-21", "2026-09-27", "A 다음 주");
        saveWeekReview(a, "TRY", "targetGoalId", aNextWeek).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].targetGoalId").value(aNextWeek));
    }

    @Test
    void tryCannotBecomeADayUnderAnotherUsersGoal() throws Exception {
        String review = a.weekReview("다음 주에 시도");
        String item = JsonPath.read(review, "$.items[0].id");

        rejected(a.send(post("/api/v1/review-items/" + item + "/convert"),
                UserApi.dayJson(bGoals.week(), "2026-09-18", null)), "DAY_REQUIRES_WEEK_GOAL");
        a.mvc.perform(get("/api/v1/reviews/WEEK/2026-09-14"))
                .andExpect(jsonPath("$.items[0].convertedDayId").value(org.hamcrest.Matchers.nullValue()));
        a.send(post("/api/v1/review-items/" + item + "/convert"), UserApi.dayJson(aGoals.week(), "2026-09-18", null))
                .andExpect(status().isOk());
    }

    @Test
    void carryOverCannotReuseOrReferenceAnotherUsersGoals() throws Exception {
        String source = a.day(aGoals.week(), "2026-09-15", null);
        String bNextWeek = b.goal(bGoals.month(), "WEEK", "2026-09-21", "2026-09-27", "B 다음 주");

        // B's Goals are never offered as targets.
        a.send(post("/api/v1/recovery/carry-over/preview"), preview(source, "DAY_ONLY", null, null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.targetWeekGoals").isEmpty())
                .andExpect(jsonPath("$.ready").value(false));
        rejected(a.send(post("/api/v1/recovery/carry-over/preview"), preview(source, "DAY_ONLY", bNextWeek, null)),
                "INVALID_RECOVERY_DECISION");
        rejected(a.send(post("/api/v1/recovery/carry-over/preview"), preview(source, "WITH_PLAN", null,
                "[{\"type\": \"WEEK\", \"goalId\": \"%s\", \"create\": false}]".formatted(bNextWeek))),
                "INVALID_RECOVERY_DECISION");
        a.send(post("/api/v1/recovery/carry-over/apply"), """
                {"localDate": "%s", "sourceDayId": "%s", "targetDate": "2026-09-22", "mode": "DAY_ONLY",
                 "targetWeekGoalId": "%s", "days": [{"id": "%s", "version": 0}]}
                """.formatted(TODAY, source, bNextWeek, source))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECOVERY_DECISION"));
        // A WITH_PLAN apply that lists B's Goal as a previewed Goal is refused before anything is written.
        a.send(post("/api/v1/recovery/carry-over/apply"), """
                {"localDate": "%s", "sourceDayId": "%s", "targetDate": "2026-09-22", "mode": "WITH_PLAN",
                 "days": [{"id": "%s", "version": 0}],
                 "goals": [{"id": "%s", "version": 0}, {"id": "%s", "version": 0}, {"id": "%s", "version": 0},
                           {"id": "%s", "version": 0}, {"id": "%s", "version": 0}]}
                """.formatted(TODAY, source, source, aGoals.year(), aGoals.quarter(), aGoals.month(), aGoals.week(),
                bNextWeek))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        a.mvc.perform(get("/api/v1/recovery/events")).andExpect(jsonPath("$").isEmpty());
        b.mvc.perform(get("/api/v1/days").param("goalId", bNextWeek)).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void recoveryDayCannotReleaseAnotherUsersCoreDay() throws Exception {
        String bCoreDay = b.day(null, "2026-09-18", null);
        a.send(put("/api/v1/recovery-days/2026-09-18"), """
                {"returnDate": null, "note": "", "expectedVersion": null,
                 "releaseCoreDays": [{"id": "%s", "version": 0}]}
                """.formatted(bCoreDay))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DAY_NOT_FOUND"));
        b.mvc.perform(get("/api/v1/days/" + bCoreDay)).andExpect(jsonPath("$.coreDay").value(true));
    }

    private ResultActions saveWeekReview(UserApi user, String kind, String linkField, String goalId) throws Exception {
        return user.send(put("/api/v1/reviews/WEEK/2026-09-14"), """
                {"rating": null, "completed": false, "expectedVersion": null,
                 "items": [{"id": null, "kind": "%s", "content": "연결 시도", "%s": "%s"}]}
                """.formatted(kind, linkField, goalId));
    }

    private static String preview(String sourceDayId, String mode, String targetWeekGoalId, String levels) {
        return """
                {"localDate": "%s", "sourceDayId": "%s", "targetDate": "2026-09-22", "mode": "%s",
                 "targetWeekGoalId": %s, "levels": %s}
                """.formatted(TODAY, sourceDayId, mode, UserApi.quoted(targetWeekGoalId), levels == null ? "null" : levels);
    }

    private static void rejected(ResultActions result, String code) throws Exception {
        result.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(code));
    }
}
