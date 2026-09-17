package com.dayflow.api;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dayflow.api.AuthTestSupport.UserMvc;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Backend vertical slice for independent PERIOD Goals. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class PeriodGoalApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AuthTestSupport auth;

    private UserMvc mvc;

    @BeforeEach
    void signIn() {
        mvc = auth.as(mockMvc, auth.newUser("period-goal"));
    }

    @Test
    void createsUpdatesListsAndDeletesPeriodGoal() throws Exception {
        String id = createPeriod("2026-09-21", "2026-10-08");

        mvc.perform(get("/api/v1/goals").param("kind", "PERIOD"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(id));

        send(patch("/api/v1/goals/" + id), """
                {"title": "중간고사 완주", "startDate": "2026-09-20", "endDate": "2026-10-09", "version": 0}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("PERIOD"))
                .andExpect(jsonPath("$.type").value(nullValue()))
                .andExpect(jsonPath("$.parentGoalId").value(nullValue()))
                .andExpect(jsonPath("$.progressPolicy").value("AUTO"))
                .andExpect(jsonPath("$.version").value(1));

        mvc.perform(delete("/api/v1/goals/" + id)).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/goals/" + id)).andExpect(status().isNotFound());
    }

    @Test
    void rejectsInvalidPeriodShapeAndDateOrderWithoutLooseningCalendarGoals() throws Exception {
        send(post("/api/v1/goals"), periodJson("2026-10-08", "2026-09-21"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_GOAL_PERIOD"));

        send(post("/api/v1/goals"), periodJson("2026-09-21", "2026-10-08").replace(
                "\"type\":null", "\"type\":\"WEEK\""))
                .andExpect(status().isBadRequest());

        send(post("/api/v1/goals"), """
                {"parentGoalId": null, "type": "MONTH", "title": "calendar", "why": "",
                 "startDate": "2026-09-02", "endDate": "2026-09-30", "priority": 1, "progressPolicy": "AUTO"}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_GOAL_PARENT"));
    }

    @Test
    void isolatesPeriodGoalsBetweenUsersForListGetPatchAndDelete() throws Exception {
        String id = createPeriod("2026-09-21", "2026-10-08");
        UserMvc other = auth.as(mockMvc, auth.newUser("period-goal-other"));

        other.perform(get("/api/v1/goals").param("kind", "PERIOD"))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        other.perform(get("/api/v1/goals/" + id)).andExpect(status().isNotFound());
        other.perform(patch("/api/v1/goals/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"stolen\",\"version\":0}"))
                .andExpect(status().isNotFound());
        other.perform(delete("/api/v1/goals/" + id)).andExpect(status().isNotFound());

        mvc.perform(get("/api/v1/goals/" + id)).andExpect(status().isOk());
    }

    @Test
    void linksDatesAndSchedulesOnlyInsidePeriodAndAllowsUnlinking() throws Exception {
        String goal = createPeriod("2026-09-21", "2026-10-08");
        createDay(goal, null).andExpect(status().isCreated());
        createDay(goal, "2026-09-21").andExpect(status().isCreated());
        createDay(goal, "2026-10-08").andExpect(status().isCreated());
        send(patch("/api/v1/goals/" + goal), "{\"endDate\":\"2026-10-07\",\"version\":0}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DATE_OUTSIDE_GOAL_PERIOD"));
        createDay(goal, "2026-09-20").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DATE_OUTSIDE_GOAL_PERIOD"));
        createDay(goal, "2026-10-09").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DATE_OUTSIDE_GOAL_PERIOD"));

        String day = idOf(createDay(goal, "2026-09-25").andExpect(status().isCreated()));
        send(patch("/api/v1/days/" + day), "{\"plannedDate\":\"2026-10-09\",\"version\":0}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DATE_OUTSIDE_GOAL_PERIOD"));
        send(put("/api/v1/days/" + day + "/schedule"), """
                {"startAt":"2026-10-09T10:00:00+09:00","endAt":"2026-10-09T11:00:00+09:00",
                 "timezone":"Asia/Seoul","expectedVersion":null}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DATE_OUTSIDE_GOAL_PERIOD"));

        send(patch("/api/v1/days/" + day), "{\"goalId\":null,\"version\":0}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.goalId").value(nullValue()));
        send(patch("/api/v1/days/" + day), "{\"plannedDate\":\"2026-10-09\",\"version\":1}")
                .andExpect(status().isOk());
    }

    @Test
    void reviewSourceAcceptsOnlyOverlappingOwnedPeriodGoalAndTargetStaysCalendar() throws Exception {
        String overlap = createPeriod("2026-09-10", "2026-09-30");
        String outside = createPeriod("2026-10-01", "2026-10-31");
        String url = "/api/v1/reviews/WEEK/2026-09-14";

        send(put(url), reviewJson(outside, null)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REVIEW_GOAL"));
        send(put(url), reviewJson(overlap, outside)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REVIEW_GOAL"));
        send(put(url), reviewJson(overlap, null)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].goalId").value(overlap));

        UserMvc other = auth.as(mockMvc, auth.newUser("period-review-other"));
        other.perform(put(url).contentType(MediaType.APPLICATION_JSON).content(reviewJson(overlap, null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REVIEW_GOAL"));
    }

    @Test
    void recoveryOffersPeriodGoalDayAndMovesOnlyInsideRange() throws Exception {
        String goal = createPeriod("2032-09-01", "2032-09-30");
        String inside = idOf(createDay(goal, "2032-09-14").andExpect(status().isCreated()));
        String outside = idOf(createDay(goal, "2032-09-14").andExpect(status().isCreated()));

        mvc.perform(get("/api/v1/recovery/candidates")
                        .param("today", "2032-09-15").param("now", "2032-09-15T18:00:00+09:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.day.id == '" + inside + "')]").isNotEmpty());

        send(post("/api/v1/recovery/apply"), recoveryMove(inside, "2032-09-20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days[0].plannedDate").value("2032-09-20"));
        send(post("/api/v1/recovery/apply"), recoveryMove(outside, "2032-10-01"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DATE_OUTSIDE_GOAL_PERIOD"));
        send(post("/api/v1/recovery/carry-over/preview"), """
                {"localDate":"2032-09-15","sourceDayId":"%s","targetDate":"2032-10-01",
                 "mode":"WITHOUT_GOAL","targetWeekGoalId":null,"levels":[],"dayIds":[]}
                """.formatted(outside))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECOVERY_DECISION"));
    }

    private String createPeriod(String startDate, String endDate) throws Exception {
        return idOf(send(post("/api/v1/goals"), periodJson(startDate, endDate))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("PERIOD"))
                .andExpect(jsonPath("$.type").value(nullValue())));
    }

    private ResultActions createDay(String goalId, String plannedDate) throws Exception {
        return send(post("/api/v1/days"), """
                {"goalId":"%s","title":"기간 실행","status":"NOT_STARTED","priority":"LOW",
                 "estimatedMinutes":30,"plannedDate":%s,"planningMode":"ANYTIME","coreDay":false}
                """.formatted(goalId, plannedDate == null ? "null" : "\"" + plannedDate + "\""));
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String body) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String idOf(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id");
    }

    private static String periodJson(String startDate, String endDate) {
        return """
                {"kind":"PERIOD","parentGoalId":null,"type":null,"title":"중간고사 준비","why":"",
                 "startDate":"%s","endDate":"%s","priority":1,"progressPolicy":"AUTO"}
                """.formatted(startDate, endDate);
    }

    private static String reviewJson(String goalId, String targetGoalId) {
        return """
                {"rating":null,"completed":false,"expectedVersion":null,"items":[
                  {"id":null,"kind":"TRY","content":"line","goalId":"%s","targetGoalId":%s}]}
                """.formatted(goalId, targetGoalId == null ? "null" : "\"" + targetGoalId + "\"");
    }

    private static String recoveryMove(String dayId, String plannedDate) {
        return """
                {"localDate":"2032-09-15","decisions":[
                  {"dayId":"%s","version":0,"action":"MOVE","plannedDate":"%s"}]}
                """.formatted(dayId, plannedDate);
    }
}
