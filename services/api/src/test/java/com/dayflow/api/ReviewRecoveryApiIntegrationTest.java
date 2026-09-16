package com.dayflow.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Review (REV-003, REV-004) and Recovery (REC-001, REC-002) API contract tests on PostgreSQL. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ReviewRecoveryApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AuthTestSupport auth;

    /** Every request of this class runs as one freshly signed-in user. */
    private AuthTestSupport.UserMvc mvc;

    @BeforeEach
    void signIn() {
        mvc = auth.as(mockMvc, auth.newUser("review-recovery"));
    }

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void rev003SavesAndReloadsKptWithVersionedReplace() throws Exception {
        String url = "/api/v1/reviews/WEEK/2031-03-03";
        mvc.perform(get(url)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("REVIEW_NOT_FOUND"));

        String created = send(put(url), """
                {"rating": 4, "completed": false, "expectedVersion": null,
                 "items": [{"id": null, "kind": "KEEP", "content": "Morning focus"},
                           {"id": null, "kind": "TRY", "content": "Start before 20:00"}]}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.periodEnd").value("2031-03-09"))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.version").value(0))
                .andReturn().getResponse().getContentAsString();
        String keepId = JsonPath.read(created, "$.items[0].id");

        send(put(url), """
                {"rating": null, "completed": true, "expectedVersion": 0,
                 "items": [{"id": "%s", "kind": "KEEP", "content": "Morning focus, again"},
                           {"id": null, "kind": "PROBLEM", "content": "Too many Days on Friday"}]}
                """.formatted(keepId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rating").value(nullValue()))
                .andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.items[0].id").value(keepId))
                .andExpect(jsonPath("$.items[1].kind").value("PROBLEM"))
                .andExpect(jsonPath("$.version").value(1));

        mvc.perform(get(url))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].content").value("Morning focus, again"));

        send(put(url), """
                {"rating": 5, "completed": true, "expectedVersion": 0, "items": []}
                """)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
    }

    @Test
    void rev001RejectsMisalignedPeriodStart() throws Exception {
        mvc.perform(get("/api/v1/reviews/MONTH/2031-03-02"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REVIEW_PERIOD"));
    }

    @Test
    void rev004ConvertsTryToDayOnce() throws Exception {
        String weekId = createWeek();
        String review = send(put("/api/v1/reviews/DAY/2026-09-15"), """
                {"rating": null, "completed": false, "expectedVersion": null,
                 "items": [{"id": null, "kind": "TRY", "content": "Plan tomorrow in 5 minutes"},
                           {"id": null, "kind": "KEEP", "content": "Walked"}]}
                """).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String tryId = JsonPath.read(review, "$.items[0].id");
        String keepId = JsonPath.read(review, "$.items[1].id");
        String dayBody = dayJson(weekId, "Plan tomorrow in 5 minutes", "2026-09-16", 60);

        String first = send(post("/api/v1/review-items/" + tryId + "/convert"), dayBody)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.day.plannedDate").value("2026-09-16"))
                .andReturn().getResponse().getContentAsString();
        String dayId = JsonPath.read(first, "$.day.id");
        assertThat((String) JsonPath.read(first, "$.review.items[0].convertedDayId")).isEqualTo(dayId);

        send(post("/api/v1/review-items/" + tryId + "/convert"), dayBody)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.day.id").value(dayId));
        assertThat(jdbc.queryForObject("select count(*) from days where title = 'Plan tomorrow in 5 minutes'",
                Integer.class)).isEqualTo(1);

        send(post("/api/v1/review-items/" + keepId + "/convert"), dayBody)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("REVIEW_ITEM_NOT_TRY"));
    }

    @Test
    void rec001AppliesKeepReduceMoveDropAndRecordsTheEvent() throws Exception {
        String weekId = createWeek();
        String keep = createDay(weekId, "Keep me", "2026-09-14", 30);
        String reduce = createDay(weekId, "Java 90", "2026-09-14", 90);
        String move = createDay(weekId, "Algorithms", "2026-09-14", 60);
        String drop = createDay(weekId, "Blog post", "2026-09-14", 60);
        send(put("/api/v1/days/" + move + "/schedule"), """
                {"startAt": "2026-09-14T19:00:00+09:00", "endAt": "2026-09-14T20:00:00+09:00",
                 "timezone": "Asia/Seoul", "expectedVersion": null}
                """).andExpect(status().isOk());

        String applied = send(post("/api/v1/recovery/apply"), """
                {"localDate": "2026-09-15", "decisions": [
                  {"dayId": "%s", "version": 0, "action": "KEEP"},
                  {"dayId": "%s", "version": 0, "action": "REDUCE", "estimatedMinutes": 30, "title": "Java 30"},
                  {"dayId": "%s", "version": 0, "action": "MOVE", "plannedDate": "2026-09-17"},
                  {"dayId": "%s", "version": 0, "action": "DROP"}]}
                """.formatted(keep, reduce, move, drop))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.days[0].estimatedMinutes").value(30))
                .andExpect(jsonPath("$.days[1].estimatedMinutes").value(30))
                .andExpect(jsonPath("$.days[1].title").value("Java 30"))
                .andExpect(jsonPath("$.days[2].plannedDate").value("2026-09-17"))
                .andExpect(jsonPath("$.days[2].schedule").value(nullValue()))
                .andExpect(jsonPath("$.days[3].status").value("SKIPPED"))
                .andReturn().getResponse().getContentAsString();

        String eventId = JsonPath.read(applied, "$.eventId");
        assertThat(jdbc.queryForList(
                "select action from recovery_event_items where event_id = ?::uuid order by action", String.class, eventId))
                .containsExactly("DROP", "KEEP", "MOVE", "REDUCE");
        assertThat(jdbc.queryForObject(
                "select previous_estimated_minutes from recovery_event_items where event_id = ?::uuid and action = 'REDUCE'",
                Integer.class, eventId)).isEqualTo(90);
    }

    @Test
    void rec001AppliesNothingWhenOneDecisionIsStale() throws Exception {
        String weekId = createWeek();
        String first = createDay(weekId, "First", "2026-09-14", 60);
        String second = createDay(weekId, "Second", "2026-09-14", 60);

        send(post("/api/v1/recovery/apply"), """
                {"localDate": "2026-09-15", "decisions": [
                  {"dayId": "%s", "version": 0, "action": "DROP"},
                  {"dayId": "%s", "version": 7, "action": "DROP"}]}
                """.formatted(first, second))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));

        mvc.perform(get("/api/v1/days/" + first))
                .andExpect(jsonPath("$.status").value("NOT_STARTED"))
                .andExpect(jsonPath("$.version").value(0));
    }

    @Test
    void rec001RejectsInvalidReduce() throws Exception {
        String weekId = createWeek();
        String day = createDay(weekId, "Short", "2026-09-14", 30);

        send(post("/api/v1/recovery/apply"), """
                {"localDate": "2026-09-15", "decisions": [
                  {"dayId": "%s", "version": 0, "action": "REDUCE", "estimatedMinutes": 45}]}
                """.formatted(day))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECOVERY_DECISION"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("decisions[0].estimatedMinutes"));
    }

    @Test
    void rec002SavesRecoveryDayWithReturnDate() throws Exception {
        String url = "/api/v1/recovery-days/2031-05-06";
        send(put(url), """
                {"returnDate": "2031-05-06", "note": "", "expectedVersion": null}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_RECOVERY_RETURN_DATE"));

        send(put(url), """
                {"returnDate": "2031-05-07", "note": "Rest after the interview", "expectedVersion": null}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.date").value("2031-05-06"))
                .andExpect(jsonPath("$.returnDate").value("2031-05-07"))
                .andExpect(jsonPath("$.version").value(0));

        mvc.perform(get("/api/v1/recovery-days?from=2031-05-01&to=2031-05-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].note").value("Rest after the interview"));

        mvc.perform(delete(url)).andExpect(status().isNoContent());
        mvc.perform(delete(url)).andExpect(status().isNotFound());
    }

    private String createWeek() throws Exception {
        String yearId = createGoal(null, "YEAR", "2026-01-01", "2026-12-31");
        String quarterId = createGoal(yearId, "QUARTER", "2026-07-01", "2026-09-30");
        String monthId = createGoal(quarterId, "MONTH", "2026-09-01", "2026-09-30");
        return createGoal(monthId, "WEEK", "2026-09-14", "2026-09-20");
    }

    private String createGoal(String parentId, String type, String startDate, String endDate) throws Exception {
        String json = """
                {"parentGoalId": %s, "type": "%s", "title": "%s goal", "why": "",
                 "startDate": "%s", "endDate": "%s", "priority": 1, "progressPolicy": "AUTO"}
                """.formatted(parentId == null ? "null" : "\"" + parentId + "\"", type, type, startDate, endDate);
        return JsonPath.read(send(post("/api/v1/goals"), json).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");
    }

    private String createDay(String goalId, String title, String plannedDate, int minutes) throws Exception {
        return JsonPath.read(send(post("/api/v1/days"), dayJson(goalId, title, plannedDate, minutes))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private static String dayJson(String goalId, String title, String plannedDate, int minutes) {
        return """
                {"goalId": "%s", "title": "%s", "status": "NOT_STARTED", "priority": "LOW",
                 "estimatedMinutes": %d, "plannedDate": "%s", "planningMode": "ANYTIME", "coreDay": false}
                """.formatted(goalId, title, minutes, plannedDate);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String json) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(json));
    }
}
