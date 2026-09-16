package com.dayflow.api;

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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** REV-003 KPT ↔ Goal links and REV-004 Try → Day / Try → next Goal, against PostgreSQL. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ReviewGoalLinkApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AuthTestSupport auth;

    /** Every request of this class runs as one freshly signed-in user. */
    private AuthTestSupport.UserMvc mvc;

    @BeforeEach
    void signIn() {
        mvc = auth.as(mockMvc, auth.newUser("review-goal-link"));
    }

    @Test
    void rev003LinksKeepProblemTryToGoalsAndChangesOrClearsTheLink() throws Exception {
        String monthId = createSeptember();
        String backend = createGoal(monthId, "WEEK", "2026-09-14", "2026-09-20");
        String portfolio = createGoal(monthId, "WEEK", "2026-09-14", "2026-09-20");
        String url = "/api/v1/reviews/WEEK/2026-09-14";

        String saved = send(put(url), """
                {"rating": null, "completed": false, "expectedVersion": null, "items": [
                  {"id": null, "kind": "KEEP", "content": "Algorithm load was right", "goalId": "%s"},
                  {"id": null, "kind": "PROBLEM", "content": "Portfolio was too much", "goalId": "%s"},
                  {"id": null, "kind": "TRY", "content": "3 problems instead of 5", "goalId": "%s"},
                  {"id": null, "kind": "KEEP", "content": "Slept well"}]}
                """.formatted(backend, portfolio, backend))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].goalId").value(backend))
                .andExpect(jsonPath("$.items[1].goalId").value(portfolio))
                .andExpect(jsonPath("$.items[2].goalId").value(backend))
                .andExpect(jsonPath("$.items[2].targetGoalId").value(nullValue()))
                // No Goal is a normal line.
                .andExpect(jsonPath("$.items[3].goalId").value(nullValue()))
                .andReturn().getResponse().getContentAsString();
        String keepId = JsonPath.read(saved, "$.items[0].id");
        String problemId = JsonPath.read(saved, "$.items[1].id");

        // Change the KEEP link and clear the PROBLEM link; the other lines keep theirs.
        send(put(url), """
                {"rating": 3, "completed": false, "expectedVersion": 0, "items": [
                  {"id": "%s", "kind": "KEEP", "content": "Algorithm load was right", "goalId": "%s"},
                  {"id": "%s", "kind": "PROBLEM", "content": "Portfolio was too much", "goalId": null}]}
                """.formatted(keepId, portfolio, problemId))
                .andExpect(status().isOk());

        mvc.perform(get(url))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rating").value(3))
                .andExpect(jsonPath("$.items[0].goalId").value(portfolio))
                .andExpect(jsonPath("$.items[1].goalId").value(nullValue()));
    }

    @Test
    void rev003RejectsGoalsOutsideTheReviewLevelOrPeriod() throws Exception {
        String monthId = createSeptember();
        String otherWeek = createGoal(monthId, "WEEK", "2026-09-07", "2026-09-13");
        String url = "/api/v1/reviews/WEEK/2026-09-21";

        // A weekly review links WEEK Goals, not the MONTH above them.
        send(put(url), itemJson("KEEP", monthId, null, null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REVIEW_GOAL"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("items[0].goalId"));

        send(put(url), itemJson("KEEP", otherWeek, null, null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REVIEW_GOAL"));

        mvc.perform(get(url)).andExpect(status().isNotFound());
    }

    @Test
    void rev003KeepsTheReviewLineWhenItsGoalIsDeleted() throws Exception {
        String week = createGoal(createSeptember(), "WEEK", "2026-09-14", "2026-09-20");
        String url = "/api/v1/reviews/DAY/2026-09-18";
        send(put(url), itemJson("PROBLEM", week, null, null)).andExpect(status().isOk());

        mvc.perform(delete("/api/v1/goals/" + week)).andExpect(status().isNoContent());

        mvc.perform(get(url))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].content").value("line"))
                .andExpect(jsonPath("$.items[0].goalId").value(nullValue()));
    }

    @Test
    void rev004CarriesATryIntoANextGoalWithoutLosingItsSourceGoal() throws Exception {
        String yearId = createGoal(null, "YEAR", "2026-01-01", "2026-12-31");
        String q3 = createGoal(yearId, "QUARTER", "2026-07-01", "2026-09-30");
        String q4 = createGoal(yearId, "QUARTER", "2026-10-01", "2026-12-31");
        String september = createGoal(q3, "MONTH", "2026-09-01", "2026-09-30");
        String october = createGoal(q4, "MONTH", "2026-10-01", "2026-10-31");
        String url = "/api/v1/reviews/MONTH/2026-09-01";

        // Only TRY lines can be carried forward, and only into a Goal that continues after the period.
        send(put(url), itemJson("KEEP", september, october, null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REVIEW_GOAL"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("items[0].targetGoalId"));
        send(put(url), itemJson("TRY", september, september, null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REVIEW_GOAL"));

        String saved = send(put(url), itemJson("TRY", september, null, null))
                .andExpect(status().isOk())
                // Saving a Try links nothing forward by itself.
                .andExpect(jsonPath("$.items[0].targetGoalId").value(nullValue()))
                .andReturn().getResponse().getContentAsString();
        String tryId = JsonPath.read(saved, "$.items[0].id");

        send(put(url), itemJson("TRY", september, october, tryId, 0))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].goalId").value(september))
                .andExpect(jsonPath("$.items[0].targetGoalId").value(october));

        // Try → Day is a separate action: a Day without a Goal.
        String converted = send(post("/api/v1/review-items/" + tryId + "/convert"), dayJson(null, "2026-10-05"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.day.goalId").value(nullValue()))
                .andExpect(jsonPath("$.review.items[0].targetGoalId").value(october))
                .andReturn().getResponse().getContentAsString();
        String dayId = JsonPath.read(converted, "$.day.id");
        int version = JsonPath.read(converted, "$.review.version");

        // Clearing the next Goal keeps the source Goal and the created Day.
        send(put(url), itemJson("TRY", september, null, tryId, version))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].goalId").value(september))
                .andExpect(jsonPath("$.items[0].targetGoalId").value(nullValue()))
                .andExpect(jsonPath("$.items[0].convertedDayId").value(dayId));
        mvc.perform(get("/api/v1/days/" + dayId)).andExpect(status().isOk());

        mvc.perform(get(url))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].convertedDayId").value(dayId));
    }

    @Test
    void rev004ConvertsATryToADayWithAnOptionalWeekGoal() throws Exception {
        String monthId = createSeptember();
        String week = createGoal(monthId, "WEEK", "2026-09-14", "2026-09-20");
        String saved = send(put("/api/v1/reviews/DAY/2026-09-17"), itemJson("TRY", null, null, null))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String tryId = JsonPath.read(saved, "$.items[0].id");
        String convert = "/api/v1/review-items/" + tryId + "/convert";

        send(post(convert), dayJson(monthId, "2026-09-18"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DAY_REQUIRES_WEEK_GOAL"));
        send(post(convert), dayJson(week, "2026-09-22"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("DATE_OUTSIDE_WEEK_GOAL_PERIOD"));
        // Failed attempts did not mark the item as converted.
        mvc.perform(get("/api/v1/reviews/DAY/2026-09-17"))
                .andExpect(jsonPath("$.items[0].convertedDayId").value(nullValue()));

        String first = send(post(convert), dayJson(week, "2026-09-18"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.day.goalId").value(week))
                .andReturn().getResponse().getContentAsString();
        String dayId = JsonPath.read(first, "$.day.id");

        // Converting again returns the same Day instead of creating another one.
        send(post(convert), dayJson(null, null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.day.id").value(dayId))
                .andExpect(jsonPath("$.day.goalId").value(week));
    }

    private String createSeptember() throws Exception {
        String yearId = createGoal(null, "YEAR", "2026-01-01", "2026-12-31");
        String quarterId = createGoal(yearId, "QUARTER", "2026-07-01", "2026-09-30");
        return createGoal(quarterId, "MONTH", "2026-09-01", "2026-09-30");
    }

    private String createGoal(String parentId, String type, String startDate, String endDate) throws Exception {
        String json = """
                {"parentGoalId": %s, "type": "%s", "title": "%s goal", "why": "",
                 "startDate": "%s", "endDate": "%s", "priority": 1, "progressPolicy": "AUTO"}
                """.formatted(quoted(parentId), type, type, startDate, endDate);
        return JsonPath.read(send(post("/api/v1/goals"), json).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String json) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(json));
    }

    /** A review with one line; itemId/version null create the review and the line. */
    private static String itemJson(String kind, String goalId, String targetGoalId, String itemId) {
        return itemJson(kind, goalId, targetGoalId, itemId, null);
    }

    private static String itemJson(String kind, String goalId, String targetGoalId, String itemId, Integer version) {
        return """
                {"rating": null, "completed": false, "expectedVersion": %s, "items": [
                  {"id": %s, "kind": "%s", "content": "line", "goalId": %s, "targetGoalId": %s}]}
                """.formatted(version, quoted(itemId), kind, quoted(goalId), quoted(targetGoalId));
    }

    private static String dayJson(String goalId, String plannedDate) {
        return """
                {"goalId": %s, "title": "Try as a Day", "status": "NOT_STARTED", "priority": "NONE",
                 "estimatedMinutes": 30, "plannedDate": %s, "planningMode": "ANYTIME", "coreDay": false}
                """.formatted(quoted(goalId), quoted(plannedDate));
    }

    private static String quoted(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }
}
