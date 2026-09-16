package com.dayflow.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dayflow.api.AuthTestSupport.UserMvc;
import com.jayway.jsonpath.JsonPath;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Small request helpers for tests that act as several users. Every call carries that user's token. */
final class UserApi {

    final UserMvc mvc;

    UserApi(UserMvc mvc) {
        this.mvc = mvc;
    }

    ResultActions send(MockHttpServletRequestBuilder request, String json) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(json));
    }

    String created(MockHttpServletRequestBuilder request, String json) throws Exception {
        return idOf(send(request, json).andExpect(status().isCreated()));
    }

    String idOfOk(MockHttpServletRequestBuilder request, String json) throws Exception {
        return idOf(send(request, json).andExpect(status().isOk()));
    }

    /** YEAR 2026 → Q3 → September → the week of 14–20 September, all titled {@code title}. */
    Hierarchy weekHierarchy(String title) throws Exception {
        String year = goal(null, "YEAR", "2026-01-01", "2026-12-31", title);
        String quarter = goal(year, "QUARTER", "2026-07-01", "2026-09-30", title);
        String month = goal(quarter, "MONTH", "2026-09-01", "2026-09-30", title);
        String week = goal(month, "WEEK", "2026-09-14", "2026-09-20", title);
        return new Hierarchy(year, quarter, month, week);
    }

    record Hierarchy(String year, String quarter, String month, String week) {
    }

    String goal(String parentId, String type, String startDate, String endDate, String title) throws Exception {
        return created(post("/api/v1/goals"), """
                {"parentGoalId": %s, "type": "%s", "title": "%s", "why": "", "startDate": "%s", "endDate": "%s",
                 "priority": 1, "progressPolicy": "AUTO"}
                """.formatted(quoted(parentId), type, title, startDate, endDate));
    }

    String day(String goalId, String plannedDate, String tagId) throws Exception {
        return created(post("/api/v1/days"), dayJson(goalId, plannedDate, tagId));
    }

    String tag(String name) throws Exception {
        return created(post("/api/v1/day-tags"), "{\"name\": \"%s\", \"color\": \"#ee749d\"}".formatted(name));
    }

    String category(String name) throws Exception {
        return created(post("/api/v1/event-categories"), "{\"name\": \"%s\", \"color\": \"#3a78b8\"}".formatted(name));
    }

    String event(String title, String categoryId, String linkedGoalId) throws Exception {
        return created(post("/api/v1/events"), eventJson(title, categoryId, linkedGoalId));
    }

    /** A WEEK review of 14–20 September with one Try line; returns the review body. */
    String weekReview(String tryContent) throws Exception {
        return send(put("/api/v1/reviews/WEEK/2026-09-14"), """
                {"rating": 4, "completed": true, "expectedVersion": null,
                 "items": [{"id": null, "kind": "TRY", "content": "%s"}]}
                """.formatted(tryContent))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    static String dayJson(String goalId, String plannedDate, String tagId) {
        return """
                {"goalId": %s, "title": "공부하기", "status": "NOT_STARTED", "priority": "MEDIUM", "estimatedMinutes": 60,
                 "plannedDate": %s, "planningMode": "ANYTIME", "coreDay": true, "tagIds": %s}
                """.formatted(quoted(goalId), quoted(plannedDate), tagId == null ? "[]" : "[\"" + tagId + "\"]");
    }

    static String eventJson(String title, String categoryId, String linkedGoalId) {
        return """
                {"title": "%s", "categoryId": %s, "allDay": false, "startAt": "2026-09-15T10:00:00+09:00",
                 "endAt": "2026-09-15T11:00:00+09:00", "timezone": "Asia/Seoul", "recurrence": "NONE",
                 "reminders": [10], "linkedGoalId": %s}
                """.formatted(title, quoted(categoryId), quoted(linkedGoalId));
    }

    static String idOf(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id");
    }

    static String quoted(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }
}
