package com.dayflow.api;

import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
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

/** API contract tests against a real PostgreSQL (GOAL-001, DAY-001, DAY-002). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class GoalDayApiIntegrationTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void goal001CreatesYearQuarterMonthWeekHierarchy() throws Exception {
        String yearId = createYear();
        String quarterId = createGoal(yearId, "QUARTER", "2026-07-01", "2026-09-30");
        String monthId = createGoal(quarterId, "MONTH", "2026-09-01", "2026-09-30");

        send(post("/api/v1/goals"), goalJson(monthId, "WEEK", "2026-09-14", "2026-09-20"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", startsWith("/api/v1/goals/")))
                .andExpect(jsonPath("$.type").value("WEEK"))
                .andExpect(jsonPath("$.parentGoalId").value(monthId))
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.createdAt").isNotEmpty());
    }

    @Test
    void goal001RejectsParentThatSkipsALevel() throws Exception {
        String yearId = createYear();

        send(post("/api/v1/goals"), goalJson(yearId, "MONTH", "2026-09-01", "2026-09-30"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_GOAL_PARENT"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("parentGoalId"))
                .andExpect(jsonPath("$.traceId").isNotEmpty());
    }

    @Test
    void goal001RejectsChildOutsideParentPeriod() throws Exception {
        String yearId = createYear();

        send(post("/api/v1/goals"), goalJson(yearId, "QUARTER", "2026-10-01", "2027-01-10"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GOAL_OUTSIDE_PARENT_PERIOD"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("endDate"));
    }

    @Test
    void rejectsInvalidRequestBody() throws Exception {
        send(post("/api/v1/goals"), """
                {"parentGoalId": null, "type": "YEAR", "title": " ", "why": "", "startDate": "2026-01-01",
                 "endDate": "2026-12-31", "priority": 1, "progressPolicy": "AUTO"}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("title"));
    }

    @Test
    void returnsNotFoundForUnknownGoal() throws Exception {
        mvc.perform(get("/api/v1/goals/00000000-0000-4000-8000-000000000000"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("GOAL_NOT_FOUND"));
    }

    @Test
    void goal001RejectsStaleGoalVersion() throws Exception {
        String yearId = createYear();
        send(patch("/api/v1/goals/" + yearId), """
                {"title": "Renamed", "version": 0}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));

        send(patch("/api/v1/goals/" + yearId), """
                {"title": "Stale rename", "version": 0}
                """)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
    }

    @Test
    void day001CreatesDayWithoutPlannedDate() throws Exception {
        String weekId = createWeek();

        send(post("/api/v1/days"), dayJson(weekId, null))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", startsWith("/api/v1/days/")))
                .andExpect(jsonPath("$.goalId").value(weekId))
                .andExpect(jsonPath("$.plannedDate").value(nullValue()))
                .andExpect(jsonPath("$.schedule").value(nullValue()));
    }

    @Test
    void day001RejectsDayUnderNonWeekGoal() throws Exception {
        String yearId = createYear();

        send(post("/api/v1/days"), dayJson(yearId, null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DAY_REQUIRES_WEEK_GOAL"));
    }

    @Test
    void day002RejectsPlannedDateOutsideWeekGoal() throws Exception {
        String weekId = createWeek();

        send(post("/api/v1/days"), dayJson(weekId, "2026-09-21"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DATE_OUTSIDE_WEEK_GOAL_PERIOD"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("plannedDate"));
    }

    @Test
    void day002CreatesAndReplacesScheduleAndSyncsPlannedDate() throws Exception {
        String dayId = createDay(createWeek(), null);

        // 2026-09-15 15:30 UTC is 2026-09-16 00:30 in Seoul, so plannedDate follows the local date.
        send(put("/api/v1/days/" + dayId + "/schedule"), scheduleJson(
                "2026-09-15T15:30:00Z", "2026-09-15T16:30:00Z", "Asia/Seoul", null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plannedDate").value("2026-09-16"))
                .andExpect(jsonPath("$.schedule.startAt").value("2026-09-16T00:30:00+09:00"))
                .andExpect(jsonPath("$.schedule.timezone").value("Asia/Seoul"))
                .andExpect(jsonPath("$.schedule.version").value(0));

        send(put("/api/v1/days/" + dayId + "/schedule"), scheduleJson(
                "2026-09-17T19:00:00+09:00", "2026-09-17T20:30:00+09:00", "Asia/Seoul", 0L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plannedDate").value("2026-09-17"))
                .andExpect(jsonPath("$.schedule.endAt").value("2026-09-17T20:30:00+09:00"))
                .andExpect(jsonPath("$.schedule.version").value(1));
    }

    @Test
    void day002RejectsScheduleEndNotAfterStart() throws Exception {
        String dayId = createDay(createWeek(), null);

        send(put("/api/v1/days/" + dayId + "/schedule"), scheduleJson(
                "2026-09-15T19:00:00+09:00", "2026-09-15T19:00:00+09:00", "Asia/Seoul", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SCHEDULE_RANGE"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("endAt"));
    }

    @Test
    void day002RejectsScheduleRequestWithoutExpectedVersionField() throws Exception {
        String dayId = createDay(createWeek(), null);

        // Omitting expectedVersion is not the same as sending null: the field is required.
        send(put("/api/v1/days/" + dayId + "/schedule"), """
                {"startAt": "2026-09-15T19:00:00+09:00", "endAt": "2026-09-15T20:00:00+09:00",
                 "timezone": "Asia/Seoul"}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        mvc.perform(get("/api/v1/days/" + dayId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schedule").value(nullValue()));
    }

    @Test
    void deletesReturnNoContent() throws Exception {
        String weekId = createWeek();
        String dayId = createDay(weekId, null);
        send(put("/api/v1/days/" + dayId + "/schedule"), scheduleJson(
                "2026-09-15T19:00:00+09:00", "2026-09-15T20:00:00+09:00", "Asia/Seoul", null))
                .andExpect(status().isOk());

        mvc.perform(delete("/api/v1/days/" + dayId + "/schedule"))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
        mvc.perform(delete("/api/v1/days/" + dayId))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
        mvc.perform(delete("/api/v1/goals/" + weekId))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        mvc.perform(get("/api/v1/days/" + dayId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/goals/" + weekId)).andExpect(status().isNotFound());
    }

    @Test
    void day002RejectsStaleScheduleVersion() throws Exception {
        String dayId = createDay(createWeek(), null);
        String create = scheduleJson("2026-09-15T19:00:00+09:00", "2026-09-15T20:00:00+09:00", "Asia/Seoul", null);
        send(put("/api/v1/days/" + dayId + "/schedule"), create).andExpect(status().isOk());

        // A second "create" means the client did not see the existing schedule.
        send(put("/api/v1/days/" + dayId + "/schedule"), create)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SCHEDULE_VERSION_CONFLICT"));
    }

    @Test
    void day002MovesScheduleWithPlannedDateAndRemovesItWhenDateIsCleared() throws Exception {
        String dayId = createDay(createWeek(), null);
        send(put("/api/v1/days/" + dayId + "/schedule"), scheduleJson(
                "2026-09-15T19:00:00+09:00", "2026-09-15T20:30:00+09:00", "Asia/Seoul", null))
                .andExpect(status().isOk());

        String moved = send(patch("/api/v1/days/" + dayId), """
                {"plannedDate": "2026-09-18", "version": 1}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schedule.startAt").value("2026-09-18T19:00:00+09:00"))
                .andExpect(jsonPath("$.schedule.endAt").value("2026-09-18T20:30:00+09:00"))
                .andReturn().getResponse().getContentAsString();
        int version = JsonPath.read(moved, "$.version");

        send(patch("/api/v1/days/" + dayId), "{\"plannedDate\": null, \"version\": " + version + "}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plannedDate").value(nullValue()))
                .andExpect(jsonPath("$.schedule").value(nullValue()));
    }

    @Test
    void day002DeletingScheduleKeepsDay() throws Exception {
        String dayId = createDay(createWeek(), null);
        send(put("/api/v1/days/" + dayId + "/schedule"), scheduleJson(
                "2026-09-15T19:00:00+09:00", "2026-09-15T20:00:00+09:00", "Asia/Seoul", null))
                .andExpect(status().isOk());

        mvc.perform(delete("/api/v1/days/" + dayId + "/schedule")).andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/days/" + dayId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plannedDate").value("2026-09-15"))
                .andExpect(jsonPath("$.schedule").value(nullValue()));
    }

    private String createYear() throws Exception {
        return createGoal(null, "YEAR", "2026-01-01", "2026-12-31");
    }

    private String createWeek() throws Exception {
        String quarterId = createGoal(createYear(), "QUARTER", "2026-07-01", "2026-09-30");
        String monthId = createGoal(quarterId, "MONTH", "2026-09-01", "2026-09-30");
        return createGoal(monthId, "WEEK", "2026-09-14", "2026-09-20");
    }

    private String createGoal(String parentId, String type, String startDate, String endDate) throws Exception {
        return idOf(send(post("/api/v1/goals"), goalJson(parentId, type, startDate, endDate))
                .andExpect(status().isCreated()));
    }

    private String createDay(String goalId, String plannedDate) throws Exception {
        return idOf(send(post("/api/v1/days"), dayJson(goalId, plannedDate)).andExpect(status().isCreated()));
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String json) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private static String idOf(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id");
    }

    private static String goalJson(String parentId, String type, String startDate, String endDate) {
        return """
                {"parentGoalId": %s, "type": "%s", "title": "%s goal", "why": "Keep going",
                 "startDate": "%s", "endDate": "%s", "priority": 1, "progressPolicy": "AUTO"}
                """.formatted(quoted(parentId), type, type, startDate, endDate);
    }

    private static String dayJson(String goalId, String plannedDate) {
        return """
                {"goalId": "%s", "title": "Write API", "status": "NOT_STARTED", "priority": 1,
                 "estimatedMinutes": 60, "plannedDate": %s, "planningMode": "ANYTIME", "coreDay": true}
                """.formatted(goalId, quoted(plannedDate));
    }

    private static String scheduleJson(String startAt, String endAt, String timezone, Long expectedVersion) {
        return """
                {"startAt": "%s", "endAt": "%s", "timezone": "%s", "expectedVersion": %s}
                """.formatted(startAt, endAt, timezone, expectedVersion);
    }

    private static String quoted(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }
}
